var dbPromise;!function(){function e(e){return new Promise(function(t,n){e.onsuccess=function(){t(e.result)},e.onerror=function(){n(e.error)}})}function t(t,n,r){var o,a=new Promise(function(a,s){e(o=t[n].apply(t,r)).then(a,s)});return a.request=o,a}function n(e,t,n){n.forEach(function(n){Object.defineProperty(e.prototype,n,{get:function(){return this[t][n]},set:function(e){this[t][n]=e}})})}function r(e,n,r,o){o.forEach(function(o){o in r.prototype&&(e.prototype[o]=function(){return t(this[n],o,arguments)})})}function o(e,t,n,r){r.forEach(function(r){r in n.prototype&&(e.prototype[r]=function(){return this[t][r].apply(this[t],arguments)})})}function a(e,n,r,o){o.forEach(function(o){o in r.prototype&&(e.prototype[o]=function(){return e=this[n],(r=t(e,o,arguments)).then(function(e){if(e)return new i(e,r.request)});var e,r})})}function s(e){this._index=e}function i(e,t){this._cursor=e,this._request=t}function c(e){this._store=e}function l(e){this._tx=e,this.complete=new Promise(function(t,n){e.oncomplete=function(){t()},e.onerror=function(){n(e.error)},e.onabort=function(){n(e.error)}})}function u(e,t,n){this._db=e,this.oldVersion=t,this.transaction=new l(n)}function d(e){this._db=e}n(s,"_index",["name","keyPath","multiEntry","unique"]),r(s,"_index",IDBIndex,["get","getKey","getAll","getAllKeys","count"]),a(s,"_index",IDBIndex,["openCursor","openKeyCursor"]),n(i,"_cursor",["direction","key","primaryKey","value"]),r(i,"_cursor",IDBCursor,["update","delete"]),["advance","continue","continuePrimaryKey"].forEach(function(t){t in IDBCursor.prototype&&(i.prototype[t]=function(){var n=this,r=arguments;return Promise.resolve().then(function(){return n._cursor[t].apply(n._cursor,r),e(n._request).then(function(e){if(e)return new i(e,n._request)})})})}),c.prototype.createIndex=function(){return new s(this._store.createIndex.apply(this._store,arguments))},c.prototype.index=function(){return new s(this._store.index.apply(this._store,arguments))},n(c,"_store",["name","keyPath","indexNames","autoIncrement"]),r(c,"_store",IDBObjectStore,["put","add","delete","clear","get","getAll","getKey","getAllKeys","count"]),a(c,"_store",IDBObjectStore,["openCursor","openKeyCursor"]),o(c,"_store",IDBObjectStore,["deleteIndex"]),l.prototype.objectStore=function(){return new c(this._tx.objectStore.apply(this._tx,arguments))},n(l,"_tx",["objectStoreNames","mode"]),o(l,"_tx",IDBTransaction,["abort"]),u.prototype.createObjectStore=function(){return new c(this._db.createObjectStore.apply(this._db,arguments))},n(u,"_db",["name","version","objectStoreNames"]),o(u,"_db",IDBDatabase,["deleteObjectStore","close"]),d.prototype.transaction=function(){return new l(this._db.transaction.apply(this._db,arguments))},n(d,"_db",["name","version","objectStoreNames"]),o(d,"_db",IDBDatabase,["close"]),["openCursor","openKeyCursor"].forEach(function(e){[c,s].forEach(function(t){e in t.prototype&&(t.prototype[e.replace("open","iterate")]=function(){var t,n=(t=arguments,Array.prototype.slice.call(t)),r=n[n.length-1],o=this._store||this._index,a=o[e].apply(o,n.slice(0,-1));a.onsuccess=function(){r(a.result)}})})}),[s,c].forEach(function(e){e.prototype.getAll||(e.prototype.getAll=function(e,t){var n=this,r=[];return new Promise(function(o){n.iterateCursor(e,function(e){e?(r.push(e.value),void 0===t||r.length!=t?e.continue():o(r)):o(r)})})})});var p={open:function(e,n,r){var o=t(indexedDB,"open",[e,n]),a=o.request;return a.onupgradeneeded=function(e){r&&r(new u(a.result,e.oldVersion,a.transaction))},o.then(function(e){return new d(e)})},delete:function(e){return t(indexedDB,"deleteDatabase",[e])}};"undefined"!=typeof module?(module.exports=p,module.exports.default=module.exports):self.idb=p}();class DBHelper{static checkDatabase(){return(dbPromise=idb.open("restaurants-db",1,e=>{e.createObjectStore("restaurants-store",{keyPath:"id"}),e.createObjectStore("sync-reviews"),e.createObjectStore("sync-favourites")})).then(e=>{if(e)return dbPromise.then(e=>e.transaction("restaurants-store").objectStore("restaurants-store").getAll())})}static fetchRestaurants(e){this.checkDatabase().then(t=>{if(0!=t.length)return e(null,t);fetch("http://localhost:1337/restaurants").then(e=>e.json()).then(t=>Promise.all(t.map(e=>fetch(`http://localhost:1337/reviews/?restaurant_id=${e.id}`).then(e=>e.json()).then(n=>{e.reviews=n,dbPromise.then(e=>{let n=e.transaction("restaurants-store","readwrite").objectStore("restaurants-store");t.forEach(e=>{n.put(e)})})}))).then(n=>e(null,t))).catch(t=>{dbPromise.then(t=>{return t.transaction("restaurants-store").objectStore("restaurants-store").getAll().then(t=>e(null,t)).catch(t=>e(t,null))})})})}static fetchRestaurantById(e,t){DBHelper.fetchRestaurants((n,r)=>{if(n)t(n,null);else{const n=r.find(t=>t.id==e);n?t(null,n):t("Restaurant does not exist",null)}})}static fetchRestaurantByCuisine(e,t){DBHelper.fetchRestaurants((n,r)=>{if(n)t(n,null);else{const n=r.filter(t=>t.cuisine_type==e);t(null,n)}})}static fetchRestaurantByNeighborhood(e,t){DBHelper.fetchRestaurants((n,r)=>{if(n)t(n,null);else{const n=r.filter(t=>t.neighborhood==e);t(null,n)}})}static fetchRestaurantByCuisineAndNeighborhood(e,t,n){DBHelper.fetchRestaurants((r,o)=>{if(r)n(r,null);else{let r=o;"all"!=e&&(r=r.filter(t=>t.cuisine_type==e)),"all"!=t&&(r=r.filter(e=>e.neighborhood==t)),n(null,r)}})}static fetchNeighborhoods(e){DBHelper.fetchRestaurants((t,n)=>{if(t)e(t,null);else{const t=n.map((e,t)=>n[t].neighborhood),r=t.filter((e,n)=>t.indexOf(e)==n);e(null,r)}})}static fetchCuisines(e){DBHelper.fetchRestaurants((t,n)=>{if(t)e(t,null);else{const t=n.map((e,t)=>n[t].cuisine_type),r=t.filter((e,n)=>t.indexOf(e)==n);e(null,r)}})}static urlForRestaurant(e){return`./restaurant.html?id=${e.id}`}static imageUrlForRestaurant(e){return`./img/${e.id}.webp`}static mapMarkerForRestaurant(e,t){return new google.maps.Marker({position:e.latlng,title:e.name,url:DBHelper.urlForRestaurant(e),map:t,animation:google.maps.Animation.DROP})}static lazyload(){let e=[].slice.call(document.querySelectorAll(".lazyload"));if("IntersectionObserver"in window&&"IntersectionObserverEntry"in window&&"intersectionRatio"in window.IntersectionObserverEntry.prototype){let t=new IntersectionObserver(function(e,n){e.forEach(function(e){if(e.isIntersecting){let n=e.target;n.src=n.dataset.srcset,n.srcset=n.dataset.srcset,n.classList.remove("lazyload"),t.unobserve(n)}})});e.forEach(function(e){t.observe(e)})}}}let restaurant;var map;function mapLocation(){self.map=new google.maps.Map(document.getElementById("map"),{zoom:16,center:restaurant.latlng,scrollwheel:!1}),DBHelper.mapMarkerForRestaurant(self.restaurant,self.map)}window.initMap=(()=>{fetchRestaurantFromURL((e,t)=>{if(e)console.error("InitMap Error"+e);else{let e=document.querySelector("#map-container"),t=document.createElement("div");t.id="mapImage",t.style.opacity=1,t.style.backgroundImage='url("./img/gmaps.webp")',e.append(t);let n=document.createElement("div");n.id="interactiveMapButton",n.style.opacity=1;let r=document.createElement("p");r.id="interactiveMapLink",r.innerText="Find my location",r.setAttribute("aria-label","Click to Find Restaurant on Google Maps"),r.setAttribute("role","application"),r.addEventListener("click",()=>{mapLocation();let e=setInterval(()=>{n.style.opacity-=.1,t.style.opacity-=.1,n.style.opacity<=0&&(n.style.display="none",clearInterval(e))},100)}),n.append(r),t.append(n),fillBreadcrumb()}})}),fetchRestaurantFromURL=(e=>{if(self.restaurant)return void e(null,self.restaurant);const t=getParameterByName("id");t?DBHelper.fetchRestaurantById(t,(t,n)=>{self.restaurant=n,n?(fillRestaurantHTML(),e(null,n)):console.error(t)}):(error="No restaurant id in URL",e(error,null))}),fillRestaurantHTML=((e=self.restaurant)=>{const t=document.getElementById("restaurant-name");t.innerHTML=e.name,t.setAttribute("data-id",e.id),t.tabIndex="0";const n=document.getElementById("restaurant-address");n.innerHTML=e.address,n.tabIndex="0";const r=document.getElementById("restaurant-img");r.className="restaurant-img lazyload",r.alt="Restaurant image "+e.name,r.setAttribute("data-srcset",DBHelper.imageUrlForRestaurant(e)),document.getElementById("restaurant-cuisine").innerHTML=e.cuisine_type,e.operating_hours&&fillRestaurantHoursHTML(),DBHelper.lazyload(),fillReviewsHTML()}),fillRestaurantHoursHTML=((e=self.restaurant.operating_hours)=>{const t=document.getElementById("restaurant-hours");t.tabIndex="0";for(let n in e){const r=document.createElement("tr"),o=document.createElement("td");o.innerHTML=n,r.appendChild(o);const a=document.createElement("td");a.innerHTML=e[n],r.appendChild(a),t.appendChild(r)}}),fillReviewsHTML=((e=self.restaurant.reviews)=>{const t=document.getElementById("reviews-container"),n=document.createElement("h2");if(n.innerHTML="Reviews",n.tabIndex="0",t.appendChild(n),!e){const e=document.createElement("p");return e.innerHTML="No reviews yet!",void t.appendChild(e)}const r=document.getElementById("reviews-list");e.forEach(e=>{r.appendChild(createReviewHTML(e))}),t.appendChild(r)}),createReviewHTML=(e=>{const t=document.createElement("li"),n=document.createElement("div");n.className="top-div";const r=document.createElement("p");r.innerHTML=e.name,r.tabIndex="0",n.appendChild(r);const o=document.createElement("p");o.innerHTML=new Date(e.createdAt).toDateString(),o.tabIndex="0",n.appendChild(o),t.appendChild(n);const a=document.createElement("p");a.className="rating",a.innerHTML=`Rating: ${e.rating}`,a.tabIndex="0",t.appendChild(a);const s=document.createElement("p");return s.innerHTML=e.comments,s.tabIndex="0",t.appendChild(s),t}),fillBreadcrumb=((e=self.restaurant)=>{const t=document.getElementById("breadcrumb"),n=document.createElement("li");n.innerHTML="/ "+e.name,t.appendChild(n)}),getParameterByName=((e,t)=>{t||(t=window.location.href),e=e.replace(/[\[\]]/g,"\\$&");const n=new RegExp(`[?&]${e}(=([^&#]*)|&|#|$)`).exec(t);return n?n[2]?decodeURIComponent(n[2].replace(/\+/g," ")):"":null}),window.addEventListener("keyup",e=>{if(9==e.keyCode){document.getElementById("map-container").querySelectorAll("*").forEach(e=>{e.tabIndex="-1","interactiveMapLink"==e.id&&(e.tabIndex="0")})}});const submitFormButton=document.querySelector("#form-submit");function showDismissMessage(){document.querySelector("#offline-message").style.display="block"}submitFormButton.addEventListener("click",()=>{const e=document.querySelector("#reviews-list"),t=document.querySelector("#restaurant-name").dataset.id,n=document.querySelector("#user-name"),r=document.querySelector("#user-rating"),o=document.querySelector("#user-review");if(""==n|""==o)return;const a={restaurant_id:t,name:n.value,rating:r.value,comments:o.value,createdAt:Date.now(),updatedAt:Date.now()},s=createReviewHTML(a);e.appendChild(s),dbPromise.then(e=>{return e.transaction("restaurants-store","readwrite").objectStore("restaurants-store").get(parseInt(t)).then(t=>{t.reviews.push(a);let n=e.transaction("restaurants-store","readwrite").objectStore("restaurants-store");return n.put(t),n.complete})}),dbPromise.then(e=>{let t=e.transaction("sync-reviews","readwrite").objectStore("sync-reviews");return t.put(a,Date.now()),t.complete}),navigator.onLine||showDismissMessage(),"serviceWorker"in navigator&&navigator.serviceWorker.ready.then(e=>e.sync.register("sync-reviews")),n.value="",o.value=""}),"serviceWorker"in navigator&&window.addEventListener("load",()=>{navigator.serviceWorker.register("./sw.js").then(e=>{console.log("Service Worker Registered!")}).catch(e=>{console.log("Service Worker Not Registered!"+e)})});