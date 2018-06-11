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