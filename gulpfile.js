var gulp = require('gulp');
var sass = require('gulp-sass');
var autoprefixer = require('gulp-autoprefixer');
var concat = require('gulp-concat');
var uglify = require('gulp-uglify-es').default;
var imagemin = require('gulp-imagemin');
var imageResize = require('gulp-image-resize');
var webp = require('gulp-webp');
var gzip = require('gulp-gzip');
var sourcemaps = require('gulp-sourcemaps');
var htmlmin = require('gulp-htmlmin');
var inlinesource = require('gulp-inline-source');

/**
 * WATCH TASKS
 */
// Watch Sass and convert to css
gulp.task('styles', function () {
    gulp.src('./src/sass/*.scss')
        .pipe(sass().on('error', sass.logError))
        .pipe(autoprefixer({
            browsers: ['last 2 versions']
        }))
        .pipe(gulp.dest('./src/css'));
});
gulp.task('watch-sass', function () {
    gulp.watch('./src/sass/*.scss ', ['styles']);
});

// Watch and Concat Javascript 
gulp.task('concat-scripts', function () {
    gulp.src(['./src/js/idb.js', './src/js/dbhelper.js', './src/js/main.js'])
        .pipe(concat('all-main.js'))
        .pipe(gulp.dest('./src/js'));
    gulp.src(['./src/js/idb.js', './src/js/dbhelper.js', './src/js/restaurant_info.js'])
        .pipe(concat('all-restaurant.js'))
        .pipe(gulp.dest('./src/js'));
});
gulp.task('watch-js', function () {
    gulp.watch('./src/js/*.js ', ['concat-scripts']);
});

/**
 * BUILD TASKS
 */

// Images
gulp.task('build-images', () =>
    gulp.src('./src/img/*.jpg')
        .pipe(imageResize({
            width: 400,
            upscale: false,
        }))
        .pipe(imagemin({
            optimizationLevel: 5,
            progressive: true,
            interlaced: true
        }))
        .pipe(webp())
        .pipe(gulp.dest('./src/img'))
);
gulp.task('pipe-images', function () {
        gulp.src('./src/img/*.webp')
        .pipe(gulp.dest('./dist/img'));
        gulp.src('./src/img/icons/*')
        .pipe(gulp.dest('./dist/img/icons'));
});
gulp.task('image-maps', () => {
    gulp.src('./src/img/gmaps.png')
        .pipe(imagemin({
                optimizationLevel: 5,
                progressive: true,
                interlaced: true
            }))
        .pipe(webp())
        .pipe(gulp.dest('./src/img'))
})

// CSS
gulp.task('build-css', function () {
    gulp.src('./src/sass/*.scss')
        .pipe(sass().on('error', sass.logError))
        .pipe(autoprefixer({
            browsers: ['last 2 versions']
        }))
        .pipe(gulp.dest('./src/css'));
    gulp.src('./src/css/*.css')
        .pipe(sass({
            outputStyle: 'compressed'
        }))
        .pipe(gulp.dest('./dist/css'));
});

// HTML
gulp.task('build-html', function () {
    // Root Dir
    gulp.src(['./src/index.html', './src/restaurant.html'])
        .pipe(inlinesource())
        .pipe(htmlmin({
            collapseWhitespace: true
        }))
        .pipe(gulp.dest('./dist'))
        .pipe(gzip())
        .pipe(gulp.dest('./dist'));
});
    
gulp.task("build-js", function () {
    // js folder
    gulp.src(['./src/js/all-main.js', './src/js/all-restaurant.js'])
        .pipe(uglify())
        .pipe(gulp.dest('./dist/js'))
        .pipe(gzip())
        .pipe(gulp.dest("./dist/js"));
    // service worker
    gulp.src("./src/sw.js")
        .pipe(uglify())
        .pipe(gulp.dest('./dist'))
        .pipe(gzip())
        .pipe(gulp.dest("./dist"));
    // manifest
    gulp.src('./src/manifest.json')
        .pipe(gulp.dest('./dist'));
});


/**
 * GULP COMMAND LINE TASKS
 */
gulp.task('build', ['build-images', 'pipe-images', 'build-html', 'build-css', 'build-js'])
gulp.task('watch', ['watch-sass', 'watch-js'])