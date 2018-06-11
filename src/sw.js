!function(){function e(e){return new Promise(function(t,n){e.onsuccess=function(){t(e.result)},e.onerror=function(){n(e.error)}})}function t(t,n,o){var r,i=new Promise(function(i,u){e(r=t[n].apply(t,o)).then(i,u)});return i.request=r,i}function n(e,t,n){n.forEach(function(n){Object.defineProperty(e.prototype,n,{get:function(){return this[t][n]},set:function(e){this[t][n]=e}})})}function o(e,n,o,r){r.forEach(function(r){r in o.prototype&&(e.prototype[r]=function(){return t(this[n],r,arguments)})})}function r(e,t,n,o){o.forEach(function(o){o in n.prototype&&(e.prototype[o]=function(){return this[t][o].apply(this[t],arguments)})})}function i(e,n,o,r){r.forEach(function(r){r in o.prototype&&(e.prototype[r]=function(){return e=this[n],(o=t(e,r,arguments)).then(function(e){if(e)return new c(e,o.request)});var e,o})})}function u(e){this._index=e}function c(e,t){this._cursor=e,this._request=t}function s(e){this._store=e}function p(e){this._tx=e,this.complete=new Promise(function(t,n){e.oncomplete=function(){t()},e.onerror=function(){n(e.error)},e.onabort=function(){n(e.error)}})}function a(e,t,n){this._db=e,this.oldVersion=t,this.transaction=new p(n)}function f(e){this._db=e}n(u,"_index",["name","keyPath","multiEntry","unique"]),o(u,"_index",IDBIndex,["get","getKey","getAll","getAllKeys","count"]),i(u,"_index",IDBIndex,["openCursor","openKeyCursor"]),n(c,"_cursor",["direction","key","primaryKey","value"]),o(c,"_cursor",IDBCursor,["update","delete"]),["advance","continue","continuePrimaryKey"].forEach(function(t){t in IDBCursor.prototype&&(c.prototype[t]=function(){var n=this,o=arguments;return Promise.resolve().then(function(){return n._cursor[t].apply(n._cursor,o),e(n._request).then(function(e){if(e)return new c(e,n._request)})})})}),s.prototype.createIndex=function(){return new u(this._store.createIndex.apply(this._store,arguments))},s.prototype.index=function(){return new u(this._store.index.apply(this._store,arguments))},n(s,"_store",["name","keyPath","indexNames","autoIncrement"]),o(s,"_store",IDBObjectStore,["put","add","delete","clear","get","getAll","getKey","getAllKeys","count"]),i(s,"_store",IDBObjectStore,["openCursor","openKeyCursor"]),r(s,"_store",IDBObjectStore,["deleteIndex"]),p.prototype.objectStore=function(){return new s(this._tx.objectStore.apply(this._tx,arguments))},n(p,"_tx",["objectStoreNames","mode"]),r(p,"_tx",IDBTransaction,["abort"]),a.prototype.createObjectStore=function(){return new s(this._db.createObjectStore.apply(this._db,arguments))},n(a,"_db",["name","version","objectStoreNames"]),r(a,"_db",IDBDatabase,["deleteObjectStore","close"]),f.prototype.transaction=function(){return new p(this._db.transaction.apply(this._db,arguments))},n(f,"_db",["name","version","objectStoreNames"]),r(f,"_db",IDBDatabase,["close"]),["openCursor","openKeyCursor"].forEach(function(e){[s,u].forEach(function(t){e in t.prototype&&(t.prototype[e.replace("open","iterate")]=function(){var t,n=(t=arguments,Array.prototype.slice.call(t)),o=n[n.length-1],r=this._store||this._index,i=r[e].apply(r,n.slice(0,-1));i.onsuccess=function(){o(i.result)}})})}),[u,s].forEach(function(e){e.prototype.getAll||(e.prototype.getAll=function(e,t){var n=this,o=[];return new Promise(function(r){n.iterateCursor(e,function(e){e?(o.push(e.value),void 0===t||o.length!=t?e.continue():r(o)):r(o)})})})});var d={open:function(e,n,o){var r=t(indexedDB,"open",[e,n]),i=r.request;return i.onupgradeneeded=function(e){o&&o(new a(i.result,e.oldVersion,i.transaction))},r.then(function(e){return new f(e)})},delete:function(e){return t(indexedDB,"deleteDatabase",[e])}};"undefined"!=typeof module?(module.exports=d,module.exports.default=module.exports):self.idb=d}();

let staticCacheName = 'restaurant-reviews-v1';
let allCaches = [
    staticCacheName
];

const urlsToCache = [
    './index.html', './manifest.json', './sw.js',
    './img/1.webp', './img/2.webp', './img/3.webp', './img/4.webp', './img/5.webp', './img/6.webp', './img/7.webp', './img/8.webp', './img/9.webp', './img/10.webp', './img/gmaps.webp',
    './js/all-main.js', './js/all-restaurant.js'
];

/* Install service worker and cache files */
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(staticCacheName)
        .then(cache => {
            return cache.addAll(urlsToCache);
        })
    );
});

/* Attempt to fetch cached files else fallback to network */
self.addEventListener('fetch', event => {

    // Majority of caching;
    event.respondWith(
        caches.match(event.request)
        .then(response => {
            // Return if Cache Exists
            if (response) {
                return response;
            }
            // Clone & Fallback to Network
            let fetchRequest = event.request.clone();
            return fetch(fetchRequest)
                .then(response => {
                    // Vaildate - Exists, OK, Same-Origin
                    if (!response || response.status !== 200 || response.type !== 'basic') {
                        return response;
                    }

                    // Add to cache cumulatively
                    let responseToCache = response.clone();
                    caches.open(staticCacheName)
                        .then(cache => {
                            cache.put(event.request, responseToCache);
                        });
                    return response;
                })
        })
        .catch(error => {
            console.log('SW: ' + error)
        })
    );
});

/* Active new service worker and attempt to remove old static cache */
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.filter(cacheName => {
                    return cacheName.startsWith('restaurant-reviews-') &&
                        !allCaches.includes(cacheName)
                }).map(cacheName => {
                    return caches.delete(cacheName);
                })
            );
        })
    );
});

// Install new SW now
self.addEventListener('message', event => {
    if (event.data.action == 'skipWaiting') {
        self.skipWaiting();
    }
});

/**
 * Background sync restaurant reviews
 */
// Review and Favourite Sync Events
self.addEventListener('sync', event => {
    if (event.tag == 'sync-reviews') {
        event.waitUntil(
            syncReviews()
        )
    }
    if (event.tag == 'sync-favourites') {
        event.waitUntil(
            syncFavourites()
        );
    }
})


var dbPromise;
dbPromise = idb.open('restaurants-db', 1, upgradeDb => {
    upgradeDb.createObjectStore('restaurants-store', {
        keyPath: "id"
    });
    upgradeDb.createObjectStore('sync-reviews');
    upgradeDb.createObjectStore('sync-favourites');
});

// Open Store, Post, then Delete from Temp Store
function syncReviews() {
    dbPromise
        .then(db => {
            let reviewsStore = db.transaction('sync-reviews', 'readwrite').objectStore('sync-reviews');
            return reviewsStore.getAll()
                .then(reviews => {
                    return Promise.all(
                        reviews.map(review => {
                            fetch('http://localhost:1337/reviews/', {
                                    method: 'post',
                                    body: JSON.stringify(review)
                                })
                                .then(response => {
                                    let tx = db.transaction('sync-reviews', 'readwrite');
                                    tx.objectStore('sync-reviews').delete(review.createdAt);
                                    return tx.complete;
                                })
                        })
                    )
                })
        })
        .catch(error => {
            console.log(error);
        })
}
// Open Store, Post, then Delete from Temp Store
function syncFavourites() {
    dbPromise
        .then(db => {
            let favouritesStore = db.transaction('sync-favourites', 'readwrite').objectStore('sync-favourites');
            return favouritesStore.getAll()
                .then(favourites => {
                    return Promise.all(
                        favourites.map(favourite => {
                            fetch(`http://localhost:1337/restaurants/${favourite.id}/?is_favorite=${favourite.is_favorite}`, {
                                    method: 'put'
                                })
                                .then(response => {
                                    let tx = db.transaction('sync-favourites', 'readwrite');
                                    tx.objectStore('sync-favourites').delete(favourite.id);
                                    return tx.complete;
                                })
                        })
                    )
                })
        })
        .catch(error => {
            console.log(error);
        })
}
