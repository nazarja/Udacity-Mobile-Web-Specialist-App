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