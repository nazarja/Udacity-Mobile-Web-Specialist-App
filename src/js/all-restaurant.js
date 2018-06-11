
(function () {
    function toArray(arr) {
        return Array.prototype.slice.call(arr);
    }

    function promisifyRequest(request) {
        return new Promise(function (resolve, reject) {
            request.onsuccess = function () {
                resolve(request.result);
            };

            request.onerror = function () {
                reject(request.error);
            };
        });
    }

    function promisifyRequestCall(obj, method, args) {
        var request;
        var p = new Promise(function (resolve, reject) {
            request = obj[method].apply(obj, args);
            promisifyRequest(request).then(resolve, reject);
        });

        p.request = request;
        return p;
    }

    function promisifyCursorRequestCall(obj, method, args) {
        var p = promisifyRequestCall(obj, method, args);
        return p.then(function (value) {
            if (!value) return;
            return new Cursor(value, p.request);
        });
    }

    function proxyProperties(ProxyClass, targetProp, properties) {
        properties.forEach(function (prop) {
            Object.defineProperty(ProxyClass.prototype, prop, {
                get: function () {
                    return this[targetProp][prop];
                },
                set: function (val) {
                    this[targetProp][prop] = val;
                }
            });
        });
    }

    function proxyRequestMethods(ProxyClass, targetProp, Constructor, properties) {
        properties.forEach(function (prop) {
            if (!(prop in Constructor.prototype)) return;
            ProxyClass.prototype[prop] = function () {
                return promisifyRequestCall(this[targetProp], prop, arguments);
            };
        });
    }

    function proxyMethods(ProxyClass, targetProp, Constructor, properties) {
        properties.forEach(function (prop) {
            if (!(prop in Constructor.prototype)) return;
            ProxyClass.prototype[prop] = function () {
                return this[targetProp][prop].apply(this[targetProp], arguments);
            };
        });
    }

    function proxyCursorRequestMethods(ProxyClass, targetProp, Constructor, properties) {
        properties.forEach(function (prop) {
            if (!(prop in Constructor.prototype)) return;
            ProxyClass.prototype[prop] = function () {
                return promisifyCursorRequestCall(this[targetProp], prop, arguments);
            };
        });
    }

    function Index(index) {
        this._index = index;
    }

    proxyProperties(Index, '_index', [
        'name',
        'keyPath',
        'multiEntry',
        'unique'
    ]);

    proxyRequestMethods(Index, '_index', IDBIndex, [
        'get',
        'getKey',
        'getAll',
        'getAllKeys',
        'count'
    ]);

    proxyCursorRequestMethods(Index, '_index', IDBIndex, [
        'openCursor',
        'openKeyCursor'
    ]);

    function Cursor(cursor, request) {
        this._cursor = cursor;
        this._request = request;
    }

    proxyProperties(Cursor, '_cursor', [
        'direction',
        'key',
        'primaryKey',
        'value'
    ]);

    proxyRequestMethods(Cursor, '_cursor', IDBCursor, [
        'update',
        'delete'
    ]);

    // proxy 'next' methods
    ['advance', 'continue', 'continuePrimaryKey'].forEach(function (methodName) {
        if (!(methodName in IDBCursor.prototype)) return;
        Cursor.prototype[methodName] = function () {
            var cursor = this;
            var args = arguments;
            return Promise.resolve().then(function () {
                cursor._cursor[methodName].apply(cursor._cursor, args);
                return promisifyRequest(cursor._request).then(function (value) {
                    if (!value) return;
                    return new Cursor(value, cursor._request);
                });
            });
        };
    });

    function ObjectStore(store) {
        this._store = store;
    }

    ObjectStore.prototype.createIndex = function () {
        return new Index(this._store.createIndex.apply(this._store, arguments));
    };

    ObjectStore.prototype.index = function () {
        return new Index(this._store.index.apply(this._store, arguments));
    };

    proxyProperties(ObjectStore, '_store', [
        'name',
        'keyPath',
        'indexNames',
        'autoIncrement'
    ]);

    proxyRequestMethods(ObjectStore, '_store', IDBObjectStore, [
        'put',
        'add',
        'delete',
        'clear',
        'get',
        'getAll',
        'getKey',
        'getAllKeys',
        'count'
    ]);

    proxyCursorRequestMethods(ObjectStore, '_store', IDBObjectStore, [
        'openCursor',
        'openKeyCursor'
    ]);

    proxyMethods(ObjectStore, '_store', IDBObjectStore, [
        'deleteIndex'
    ]);

    function Transaction(idbTransaction) {
        this._tx = idbTransaction;
        this.complete = new Promise(function (resolve, reject) {
            idbTransaction.oncomplete = function () {
                resolve();
            };
            idbTransaction.onerror = function () {
                reject(idbTransaction.error);
            };
            idbTransaction.onabort = function () {
                reject(idbTransaction.error);
            };
        });
    }

    Transaction.prototype.objectStore = function () {
        return new ObjectStore(this._tx.objectStore.apply(this._tx, arguments));
    };

    proxyProperties(Transaction, '_tx', [
        'objectStoreNames',
        'mode'
    ]);

    proxyMethods(Transaction, '_tx', IDBTransaction, [
        'abort'
    ]);

    function UpgradeDB(db, oldVersion, transaction) {
        this._db = db;
        this.oldVersion = oldVersion;
        this.transaction = new Transaction(transaction);
    }

    UpgradeDB.prototype.createObjectStore = function () {
        return new ObjectStore(this._db.createObjectStore.apply(this._db, arguments));
    };

    proxyProperties(UpgradeDB, '_db', [
        'name',
        'version',
        'objectStoreNames'
    ]);

    proxyMethods(UpgradeDB, '_db', IDBDatabase, [
        'deleteObjectStore',
        'close'
    ]);

    function DB(db) {
        this._db = db;
    }

    DB.prototype.transaction = function () {
        return new Transaction(this._db.transaction.apply(this._db, arguments));
    };

    proxyProperties(DB, '_db', [
        'name',
        'version',
        'objectStoreNames'
    ]);

    proxyMethods(DB, '_db', IDBDatabase, [
        'close'
    ]);

    // Add cursor iterators
    // TODO: remove this once browsers do the right thing with promises
    ['openCursor', 'openKeyCursor'].forEach(function (funcName) {
        [ObjectStore, Index].forEach(function (Constructor) {
            // Don't create iterateKeyCursor if openKeyCursor doesn't exist.
            if (!(funcName in Constructor.prototype)) return;

            Constructor.prototype[funcName.replace('open', 'iterate')] = function () {
                var args = toArray(arguments);
                var callback = args[args.length - 1];
                var nativeObject = this._store || this._index;
                var request = nativeObject[funcName].apply(nativeObject, args.slice(0, -1));
                request.onsuccess = function () {
                    callback(request.result);
                };
            };
        });
    });

    // polyfill getAll
    [Index, ObjectStore].forEach(function (Constructor) {
        if (Constructor.prototype.getAll) return;
        Constructor.prototype.getAll = function (query, count) {
            var instance = this;
            var items = [];

            return new Promise(function (resolve) {
                instance.iterateCursor(query, function (cursor) {
                    if (!cursor) {
                        resolve(items);
                        return;
                    }
                    items.push(cursor.value);

                    if (count !== undefined && items.length == count) {
                        resolve(items);
                        return;
                    }
                    cursor.continue();
                });
            });
        };
    });

    var exp = {
        open: function (name, version, upgradeCallback) {
            var p = promisifyRequestCall(indexedDB, 'open', [name, version]);
            var request = p.request;

            request.onupgradeneeded = function (event) {
                if (upgradeCallback) {
                    upgradeCallback(new UpgradeDB(request.result, event.oldVersion, request.transaction));
                }
            };

            return p.then(function (db) {
                return new DB(db);
            });
        },
        delete: function (name) {
            return promisifyRequestCall(indexedDB, 'deleteDatabase', [name]);
        }
    };

    if (typeof module !== 'undefined') {
        module.exports = exp;
        module.exports.default = module.exports;
    } else {
        self.idb = exp;
    }
}());
/**
 * Common database helper functions.
 */
var dbPromise;
class DBHelper {

	// get from Database first - too many network requests!
	static checkDatabase() {
		// open databases
		dbPromise = idb.open('restaurants-db', 1, upgradeDb => {
			upgradeDb.createObjectStore('restaurants-store', {
				keyPath: "id"
			});
			upgradeDb.createObjectStore('sync-reviews');
			upgradeDb.createObjectStore('sync-favourites');
		});

		return dbPromise
			.then(db => {
				if (!db) return;
				// Get from store and return to fetchRestaurants
				return dbPromise.then(db => {
					return db.transaction('restaurants-store').objectStore('restaurants-store').getAll();
				})
		})
	}

	/**
	 * Fetch all restaurants.
	 */
	static fetchRestaurants(callback) {

		// cant put full function here as it gets bypasses
		//  call outside static function instead
		this.checkDatabase()
			.then(data => {
				// console.log('Success from Database');
				if (data.length != 0) {
					return callback(null, data);
				}

			fetch('http://localhost:1337/restaurants')
				.then(response => {
					return response.json()
				})
				.then(data => {
					return Promise.all(
						// map restaurants and reviews
						data.map(restaurant => {
							return fetch(`http://localhost:1337/reviews/?restaurant_id=${restaurant.id}`)
							.then(response => {
								return response.json()
								})
								.then(reviews => {
									restaurant.reviews = reviews;
									// put restaurants and reviews into db
									dbPromise.then(db => {
										let tx = db.transaction('restaurants-store', 'readwrite');
										let store = tx.objectStore('restaurants-store');
										data.forEach(restaurant => {
											store.put(restaurant);
										})
									})
								})
							})
					)
					.then(returned => {
						return callback(null, data)
					})
				})
				.catch(error => {
						// If fetch fails - try the database store
						dbPromise.then(db => {
								let tx = db.transaction('restaurants-store');
								let store = tx.objectStore('restaurants-store')
								return store.getAll()
							.then(data => {
								return callback(null, data);
							})
							.catch(err => {
								return callback(err, null)
							})
						})
				})
		})
	} // end fetchRestaurants

	/**
	 * Fetch a restaurant by its ID.
	 */
	static fetchRestaurantById(id, callback) {
		// fetch all restaurants with proper error handling.
		DBHelper.fetchRestaurants((error, restaurants) => {
			if (error) {
				callback(error, null);
			} else {
				const restaurant = restaurants.find(r => r.id == id);
				if (restaurant) { // Got the restaurant
					callback(null, restaurant);
				} else { // Restaurant does not exist in the database
					callback('Restaurant does not exist', null);
				}
			}
		});
	}

	/**
	 * Fetch restaurants by a cuisine type with proper error handling.
	 */
	static fetchRestaurantByCuisine(cuisine, callback) {
		// Fetch all restaurants  with proper error handling
		DBHelper.fetchRestaurants((error, restaurants) => {
			if (error) {
				callback(error, null);
			} else {
				// Filter restaurants to have only given cuisine type
				const results = restaurants.filter(r => r.cuisine_type == cuisine);
				callback(null, results);
			}
		});
	}

	/**
	 * Fetch restaurants by a neighborhood with proper error handling.
	 */
	static fetchRestaurantByNeighborhood(neighborhood, callback) {
		// Fetch all restaurants
		DBHelper.fetchRestaurants((error, restaurants) => {
			if (error) {
				callback(error, null);
			} else {
				// Filter restaurants to have only given neighborhood
				const results = restaurants.filter(r => r.neighborhood == neighborhood);
				callback(null, results);
			}
		});
	}

	/**
	 * Fetch restaurants by a cuisine and a neighborhood with proper error handling.
	 */
	static fetchRestaurantByCuisineAndNeighborhood(cuisine, neighborhood, callback) {
		// Fetch all restaurants
		DBHelper.fetchRestaurants((error, restaurants) => {
			if (error) {
				callback(error, null);
			} else {
				let results = restaurants
				if (cuisine != 'all') { // filter by cuisine
					results = results.filter(r => r.cuisine_type == cuisine);
				}
				if (neighborhood != 'all') { // filter by neighborhood
					results = results.filter(r => r.neighborhood == neighborhood);
				}
				callback(null, results);
			}
		});
	}

	/**
	 * Fetch all neighborhoods with proper error handling.
	 */
	static fetchNeighborhoods(callback) {
		// Fetch all restaurants
		DBHelper.fetchRestaurants((error, restaurants) => {
			if (error) {
				callback(error, null);
			} else {
				// Get all neighborhoods from all restaurants
				const neighborhoods = restaurants.map((v, i) => restaurants[i].neighborhood)
				// Remove duplicates from neighborhoods
				const uniqueNeighborhoods = neighborhoods.filter((v, i) => neighborhoods.indexOf(v) == i)
				callback(null, uniqueNeighborhoods);
			}
		});
	}

	/**
	 * Fetch all cuisines with proper error handling.
	 */
	static fetchCuisines(callback) {
		// Fetch all restaurants
		DBHelper.fetchRestaurants((error, restaurants) => {
			if (error) {
				callback(error, null);
			} else {
				// Get all cuisines from all restaurants
				const cuisines = restaurants.map((v, i) => restaurants[i].cuisine_type)
				// Remove duplicates from cuisines
				const uniqueCuisines = cuisines.filter((v, i) => cuisines.indexOf(v) == i)
				callback(null, uniqueCuisines);
			}
		});
	}

	/**
	 * Restaurant page URL.
	 */
	static urlForRestaurant(restaurant) {
		return (`./restaurant.html?id=${restaurant.id}`);
	}

	/**
	 * Restaurant image URL.
	 */
	static imageUrlForRestaurant(restaurant) {
		return (`./img/${restaurant.id}.webp`);
	}

	/**
	 * Map marker for a restaurant.
	 */
	static mapMarkerForRestaurant(restaurant, map) {
		const marker = new google.maps.Marker({
			position: restaurant.latlng,
			title: restaurant.name,
			url: DBHelper.urlForRestaurant(restaurant),
			map: map,
			animation: google.maps.Animation.DROP
		});
		return marker;
	}

	/**
	 * Lazyload Images
	 */
	static lazyload() {
		let lazyImages = [].slice.call(document.querySelectorAll(".lazyload"));

		if ("IntersectionObserver" in window && "IntersectionObserverEntry" in window && "intersectionRatio" in window.IntersectionObserverEntry.prototype) {
			let lazyImageObserver = new IntersectionObserver(function (entries, observer) {
				entries.forEach(function (entry) {
					if (entry.isIntersecting) {
						let lazyImage = entry.target;
						lazyImage.src = lazyImage.dataset.srcset;
						lazyImage.srcset = lazyImage.dataset.srcset;
						lazyImage.classList.remove("lazyload");
						lazyImageObserver.unobserve(lazyImage);
					}
				});
			});

			lazyImages.forEach(function (lazyImage) {
				lazyImageObserver.observe(lazyImage);
			});
		}
	}

} /* End of DBHelper */

let restaurant;
var map;

/* Tried to use GMAP Static API - Response time too inconsistent for lighthouse performance results */
// let lat = restaurant.latlng.lat;
// let lng = restaurant.latlng.lng;
// mapImage.style.backgroundImage = `url(https://maps.googleapis.com/maps/api/staticmap?&markers=color:red%7C${lat},${lng}&zoom=11&format=jpg&size=1920x350&key=AIzaSyAJlg1Xa7wq5ygTIQdJ4cS9C4SKKlSz2LY)`;

/**
 * Initialize Google map, called from HTML.
 */
window.initMap = () => {
	fetchRestaurantFromURL((error, restaurant) => {
		if (error) { // Got an error!
			console.error("InitMap Error"+error);
		} else {
			// Create Static Map
			let mapcontainer = document.querySelector('#map-container');
			let mapImage = document.createElement('div');
			mapImage.id = 'mapImage';
			mapImage.style.opacity = 1;
			mapImage.style.backgroundImage = 'url("./img/gmaps.webp")';
			mapcontainer.append(mapImage);

			// Create Interactive link button
			let button = document.createElement('div');
			button.id = 'interactiveMapButton';
			button.style.opacity = 1;
			let link = document.createElement('p');
			link.id = 'interactiveMapLink';
			link.innerText = 'Find my location';
			link.setAttribute('aria-label', 'Click to Find Restaurant on Google Maps');
			link.setAttribute('role', 'application');
			// On click  call google maps and fade in/out
			link.addEventListener('click', () => {
				mapLocation();
				let fade = setInterval( () => {
					button.style.opacity -= .1;
					mapImage.style.opacity -= .1;
					if (button.style.opacity <= 0) {
						button.style.display = 'none';
						clearInterval(fade);
					}
				}, 100);
			})
			button.append(link);
			mapImage.append(button);
			fillBreadcrumb();
		}
	});
}

function mapLocation() {
	self.map = new google.maps.Map(document.getElementById('map'), {
		zoom: 16,
		center: restaurant.latlng,
		scrollwheel: false
	});
	DBHelper.mapMarkerForRestaurant(self.restaurant, self.map);
}

/**
 * Get current restaurant from page URL.
 */
fetchRestaurantFromURL = (callback) => {
	if (self.restaurant) { // restaurant already fetched!
		callback(null, self.restaurant)
		return;
	}
	const id = getParameterByName('id');
	if (!id) { // no id found in URL
		error = 'No restaurant id in URL'
		callback(error, null);
	} else {
		DBHelper.fetchRestaurantById(id, (error, restaurant) => {
			self.restaurant = restaurant;
			if (!restaurant) {
				console.error(error);
				return;
			}
			fillRestaurantHTML();
			callback(null, restaurant)
		});
	}
}

/**
 * Create restaurant HTML and add it to the webpage
 */
fillRestaurantHTML = (restaurant = self.restaurant) => {
	const name = document.getElementById('restaurant-name');
	name.innerHTML = restaurant.name;
	name.setAttribute('data-id', restaurant.id)
	name.tabIndex = "0";

	const address = document.getElementById('restaurant-address');
	address.innerHTML = restaurant.address;
	address.tabIndex = "0";

	const image = document.getElementById('restaurant-img');
	image.className = 'restaurant-img lazyload'
	image.alt = 'Restaurant image ' + restaurant.name;
	// image.src = DBHelper.imageUrlForRestaurant(restaurant);
	image.setAttribute('data-srcset', DBHelper.imageUrlForRestaurant(restaurant));

	const cuisine = document.getElementById('restaurant-cuisine');
	cuisine.innerHTML = restaurant.cuisine_type;

	// fill operating hours
	if (restaurant.operating_hours) {
		fillRestaurantHoursHTML();
	}

	DBHelper.lazyload(); // Call Lazyload Images
	fillReviewsHTML(); // fill reviews
}

/**
 * Create restaurant operating hours HTML table and add it to the webpage.
 */
fillRestaurantHoursHTML = (operatingHours = self.restaurant.operating_hours) => {
	const hours = document.getElementById('restaurant-hours');
	hours.tabIndex = "0";
	for (let key in operatingHours) {
		const row = document.createElement('tr');

		const day = document.createElement('td');
		day.innerHTML = key;
		row.appendChild(day);

		const time = document.createElement('td');
		time.innerHTML = operatingHours[key];
		row.appendChild(time);

		hours.appendChild(row);
	}
}

/**
 * Create all reviews HTML and add them to the webpage.
 */
fillReviewsHTML = (reviews = self.restaurant.reviews) => {
	const container = document.getElementById('reviews-container');
	const title = document.createElement('h2');
	title.innerHTML = 'Reviews';
	title.tabIndex = "0";
	container.appendChild(title);

	if (!reviews) {
		const noReviews = document.createElement('p');
		noReviews.innerHTML = 'No reviews yet!';
		container.appendChild(noReviews);
		return;
	}
	const ul = document.getElementById('reviews-list');
	reviews.forEach(review => {
		ul.appendChild(createReviewHTML(review));
	});
	container.appendChild(ul);
}

/**
 * Create review HTML and add it to the webpage.
 */
createReviewHTML = (review) => {
	const li = document.createElement('li');
	const topDiv = document.createElement('div');
	topDiv.className = "top-div";

	const name = document.createElement('p');
	name.innerHTML = review.name;
	name.tabIndex = "0";
	topDiv.appendChild(name);

	const date = document.createElement('p');
	// date.innerHTML = review.date;
	date.innerHTML = new Date(review.createdAt).toDateString();
	date.tabIndex = "0";
	topDiv.appendChild(date);
	li.appendChild(topDiv);

	const rating = document.createElement('p');
	rating.className = "rating";
	rating.innerHTML = `Rating: ${review.rating}`;
	rating.tabIndex = "0";
	li.appendChild(rating);

	const comments = document.createElement('p');
	comments.innerHTML = review.comments;
	comments.tabIndex = "0";
	li.appendChild(comments);
	return li;
}

/**
 * Add restaurant name to the breadcrumb navigation menu
 */
fillBreadcrumb = (restaurant = self.restaurant) => {
	const breadcrumb = document.getElementById('breadcrumb');
	const li = document.createElement('li');
	li.innerHTML = '/ ' + restaurant.name;
	breadcrumb.appendChild(li);
}

/**
 * Get a parameter by name from page URL.
 */
getParameterByName = (name, url) => {
	if (!url)
		url = window.location.href;
	name = name.replace(/[\[\]]/g, '\\$&');
	const regex = new RegExp(`[?&]${name}(=([^&#]*)|&|#|$)`),
		results = regex.exec(url);
	if (!results)
		return null;
	if (!results[2])
		return '';
	return decodeURIComponent(results[2].replace(/\+/g, ' '));
}

/**
 * Disable Focus on Google Maps elements
 */
window.addEventListener('keyup', event => {
	if (event.keyCode == 9) {
		let mapEl = document.getElementById('map-container').querySelectorAll('*');
		mapEl.forEach(el => {
			el.tabIndex = '-1';
			if (el.id == 'interactiveMapLink') {
				el.tabIndex = '0';
			}
		});
	}
});

/**
 * Get form Data and - Send to page, databases and serviceWorker
 */
const submitFormButton = document.querySelector('#form-submit');
submitFormButton.addEventListener('click', () => {
	const reviewsList = document.querySelector('#reviews-list');
	const restaurantId = document.querySelector('#restaurant-name').dataset.id;
	const name = document.querySelector('#user-name');
	const rating = document.querySelector('#user-rating');
	const review = document.querySelector('#user-review');
	// prevent empty submissions
	if (name == '' | review == '') {
		return;
	}
	// create review object
	const userReview = {
		 'restaurant_id': restaurantId,
		 'name': name.value,
		 'rating': rating.value,
		 'comments': review.value,
		 'createdAt': Date.now(),
		'updatedAt': Date.now()
	}
	const appendReview = createReviewHTML(userReview);
	reviewsList.appendChild(appendReview);

	// Update Local DB Store - if offline
	dbPromise
		.then(db => {
			let store = db.transaction('restaurants-store', 'readwrite').objectStore('restaurants-store');
			return store.get(parseInt(restaurantId)).then(restaurant => {
				restaurant.reviews.push(userReview);
				let restaurantStore = db.transaction('restaurants-store', 'readwrite').objectStore('restaurants-store');
				restaurantStore.put(restaurant);
				return restaurantStore.complete;
			})
		})

	// Update the Sync Review DB Store
	dbPromise
		.then(db => {
				let reviewStore = db.transaction('sync-reviews', 'readwrite').objectStore('sync-reviews');
				reviewStore.put(userReview, Date.now());
				return reviewStore.complete;
		})

		if (!navigator.onLine) {
			showDismissMessage();
		}
	
	// Activate Background-Sync with ServiceWorkerReady
	// Creates promise to send when reconnected as well.
	if ('serviceWorker' in navigator) {
		navigator.serviceWorker.ready.then(swRegistration => {
			return swRegistration.sync.register('sync-reviews');
		});
	}

	// Clear form for next use
	name.value = '';
	review.value = '';
});

function showDismissMessage() {
	const offlineMessage = document.querySelector('#offline-message');
	offlineMessage.style.display = 'block';
}

/**
 * Register Service Worker on all pages
 */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => {
        console.log('Service Worker Registered!');
      })
      .catch(err => {
        console.log('Service Worker Not Registered!' + err);
      });
  })
}