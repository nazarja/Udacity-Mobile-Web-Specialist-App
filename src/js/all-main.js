
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

let restaurants;
let neighborhoods;
let cuisines;
var map;
var markers = [];

/**
 * Fetch neighborhoods and cuisines as soon as the page is loaded.
 */
document.addEventListener('DOMContentLoaded', (event) => {
	fetchNeighborhoods();
	fetchCuisines();
});

/**
 * Fetch all neighborhoods and set their HTML.
 */
fetchNeighborhoods = () => {
	DBHelper.fetchNeighborhoods((error, neighborhoods) => {
		if (error) { // Got an error
			console.error(error);
		} else {
			self.neighborhoods = neighborhoods;
			fillNeighborhoodsHTML();
		}
	});
}

/**
 * Set neighborhoods HTML.
 */
fillNeighborhoodsHTML = (neighborhoods = self.neighborhoods) => {
	const select = document.getElementById('neighborhoods-select');
	neighborhoods.forEach(neighborhood => {
		const option = document.createElement('option');
		option.innerHTML = neighborhood;
		option.value = neighborhood;
		select.append(option);
	});
}

/**
 * Fetch all cuisines and set their HTML.
 */
fetchCuisines = () => {
	DBHelper.fetchCuisines((error, cuisines) => {
		if (error) { // Got an error!
			console.error(error);
		} else {
			self.cuisines = cuisines;
			fillCuisinesHTML();
		}
	});
}

/**
 * Set cuisines HTML.
 */
fillCuisinesHTML = (cuisines = self.cuisines) => {
	const select = document.getElementById('cuisines-select');

	cuisines.forEach(cuisine => {
		const option = document.createElement('option');
		option.innerHTML = cuisine;
		option.value = cuisine;
		select.append(option);
	});
}

/**
 * Initialize Google map, called from HTML.
 */
window.initMap = () => {
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
	link.innerText = 'Click me for a Live Map';
	link.setAttribute('aria-label', 'Click to get live map of the restaurants');
	link.setAttribute('role', 'application');
	// On click call google maps and fade in/out
	link.addEventListener('click', () => {
		mapLocation();
		let fade = setInterval(() => {
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
	updateRestaurants();
}

function mapLocation() {
	let loc = {
		lat: 40.722216,
		lng: -73.987501
	};
	self.map = new google.maps.Map(document.getElementById('map'), {
		zoom: 12,
		center: loc,
		scrollwheel: false
	});
	addMarkersToMap();
}

/**
 * Update page and map for current restaurants.
 */
updateRestaurants = () => {
	const cSelect = document.getElementById('cuisines-select');
	const nSelect = document.getElementById('neighborhoods-select');

	const cIndex = cSelect.selectedIndex;
	const nIndex = nSelect.selectedIndex;

	const cuisine = cSelect[cIndex].value;
	const neighborhood = nSelect[nIndex].value;

	DBHelper.fetchRestaurantByCuisineAndNeighborhood(cuisine, neighborhood, (error, restaurants) => {
		if (error) { // Got an error!
			console.error(error);
		} else {
			resetRestaurants(restaurants);
			fillRestaurantsHTML();
		}
	})
}

/**
 * Clear current restaurants, their HTML and remove their map markers.
 */
resetRestaurants = (restaurants) => {
	// Remove all restaurants
	self.restaurants = [];
	const ul = document.getElementById('restaurants-list');
	ul.innerHTML = '';

	// Remove all map markers
	self.markers.forEach(m => m.setMap(null));
	self.markers = [];
	self.restaurants = restaurants;
}

/**
 * Create all restaurants HTML and add them to the webpage.
 */
fillRestaurantsHTML = (restaurants = self.restaurants) => {
	const ul = document.getElementById('restaurants-list');
	restaurants.forEach(restaurant => {
		ul.append(createRestaurantHTML(restaurant));
	});
	DBHelper.lazyload(); // Call Lazyload Images
	addMarkersToMap();
}

/**
 * Create restaurant HTML.
 */
createRestaurantHTML = (restaurant) => {
	const li = document.createElement('li');

	const image = document.createElement('img');
	image.className = 'restaurant-img lazyload';
	image.setAttribute('data-srcset', DBHelper.imageUrlForRestaurant(restaurant));
	image.alt = 'Restaurant image ' + restaurant.name;
	li.append(image);
	
	// Mark as favourite
	const favouriteContainer = document.createElement('div')
	favouriteContainer.className = 'favourite-container';

	const favouriteInput = document.createElement('input');
	favouriteInput.type = 'checkbox';
	favouriteInput.className = 'checkbox';
	favouriteInput.name = restaurant.id;
	favouriteInput.setAttribute('aria-label', `Mark ${restaurant.name} as Favourite`);
	favouriteInput.setAttribute('data-id', restaurant.id);
	favouriteInput.addEventListener('click', markAsFavourite);
	favouriteContainer.append(favouriteInput);
	
	const favouriteLabel = document.createElement('label');
	favouriteLabel.className = 'favouriteLabel';
	favouriteLabel.for = 'markFavourite';
	favouriteLabel.innerText = ' mark as favourite';
	if (restaurant.is_favorite == 'true') {
		favouriteLabel.innerText = ' unmark as favourite';
		favouriteInput.checked = 'checked';
	}
	favouriteContainer.append(favouriteLabel);
	li.append(favouriteContainer);

	const name = document.createElement('h2');
	name.innerHTML = restaurant.name;
	li.append(name);

	const neighborhood = document.createElement('p');
	neighborhood.innerHTML = restaurant.neighborhood;
	li.append(neighborhood);

	const address = document.createElement('p');
	address.innerHTML = restaurant.address;
	li.append(address);

	const more = document.createElement('a');
	more.innerHTML = 'View Details';
	more.href = DBHelper.urlForRestaurant(restaurant);
	more.setAttribute('aria-label', restaurant.name + " View Details");
	li.append(more)

	return li
}
/**
 * Mark Restaurant as Favourite Function
 */
function markAsFavourite() {
	let restaurantId = parseInt(this.dataset.id);

	function putInStore(bool) {
		// Update local Database
		dbPromise
			.then(db => {
				let store = db.transaction('restaurants-store', 'readwrite').objectStore('restaurants-store');
				return store.get(restaurantId).then(restaurant => {
					restaurant.is_favorite = bool;
					let restaurantStore = db.transaction('restaurants-store', 'readwrite').objectStore('restaurants-store');
					restaurantStore.put(restaurant);
					return restaurantStore.complete;
				})
			})
	
		// Put in favourites Store to sync
		dbPromise
			.then(db => {
				let favouritesStore = db.transaction('sync-favourites', 'readwrite').objectStore('sync-favourites');
				favouritesStore.put({'id': restaurantId, 'is_favorite': bool}, restaurantId);
				return favouritesStore.complete;
			})
	}

	if (this.checked) {
		this.nextElementSibling.innerHTML = ' unmark as favourite';
		putInStore(true);

	} 
	else {
		this.nextElementSibling.innerHTML = ' mark as favourite';
		putInStore(false);
	}

	// Activate Background-Sync with ServiceWorkerReady
	// Creates promise to send when reconnected as well.
	if ('serviceWorker' in navigator) {
		navigator.serviceWorker.ready.then(swRegistration => {
			return swRegistration.sync.register('sync-favourites');
		});
	}
}

/**
 * Add markers for current restaurants to the map.
 */
addMarkersToMap = (restaurants = self.restaurants) => {
	restaurants.forEach(restaurant => {
		// Add marker to the map
		const marker = DBHelper.mapMarkerForRestaurant(restaurant, self.map);
		google.maps.event.addListener(marker, 'click', () => {
			window.location.href = marker.url
		});
		self.markers.push(marker);
	});
}

/**
 * Toggle Hamburger Menu
 */
const checkbox = document.querySelector('#checkbox');
const filterOptions = document.querySelector('#filter-options');
// Check is menu is open and set height and visibility
function mobileMenu() {
	if (checkbox.checked) {
		filterOptions.style.height = "160px";
		filterOptions.style.visibility = "visible";
	} else {
		filterOptions.style.height = "0px";
		filterOptions.style.visibility = "hidden";
	}
}

// Listen for changes to open / close menu
checkbox.addEventListener('change', function () {
	mobileMenu();
});

// Listen for resize window and set menu bar appropriately
window.addEventListener("resize", event => {
	let width = window.innerWidth;
	if (width > 850) {
		filterOptions.style.height = "auto";
		filterOptions.style.visibility = "visible";
	} else {
		mobileMenu();
	}
});

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