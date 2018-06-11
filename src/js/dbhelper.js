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
