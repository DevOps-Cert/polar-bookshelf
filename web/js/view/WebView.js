const {Delegator, Styles, Elements, forDict} = require("../utils.js");
const {DocMetaDescriber} = require("../metadata/DocMetaDescriber");
const {DocFormatFactory} = require("../docformat/DocFormatFactory");
const {CompositePagemarkRenderer} = require("../pagemarks/CompositePagemarkRenderer");
const {MainPagemarkRenderer} = require("../pagemarks/MainPagemarkRenderer");
const {ThumbnailPagemarkRenderer} = require("../pagemarks/ThumbnailPagemarkRenderer");

const {View} = require("./View.js");

module.exports.WebView = class extends View {

    constructor(model) {
        super(model);

        /**
         * The currently defined renderer for pagemarks.
         */
        this.pagemarkRenderer = null;
        this.docFormat = DocFormatFactory.getInstance();

    }

    start() {

        this.model.registerListenerForCreatePagemark(this.onCreatePagemark.bind(this));
        this.model.registerListenerForErasePagemark(this.onErasePagemark.bind(this));
        this.model.registerListenerForDocumentLoaded(this.onDocumentLoaded.bind(this));

        return this;

    }

    updateProgress() {

        let perc = this.computeProgress(this.model.docMeta);

        console.log("Percentage is now: " + perc);

        document.querySelector("#polar-progress progress").value = perc;

        // now update the description of the doc at the bottom.

        let description = DocMetaDescriber.describe(this.model.docMeta);

        let docOverview = document.querySelector("#polar-doc-overview");

        if(docOverview) {
            docOverview.textContent = description;
        }

    }

    computeProgress(docMeta) {

        // I think this is an issue of being async maybel?

        let total = 0;

        forDict(docMeta.pageMetas, function (key, pageMeta) {

            forDict(pageMeta.pagemarks, function (column, pagemark) {

                total += pagemark.percentage;

            }.bind(this));

        }.bind(this));

        let perc = total / (docMeta.docInfo.nrPages * 100);

        return perc;
    }

    /**
     * Setup a document once we detect that a new one has been loaded.
     */
    onDocumentLoaded() {

        console.log("WebView.onDocumentLoaded: ", this.model.docMeta);

        let pagemarkRendererDelegates = [
            new MainPagemarkRenderer(this),
        ];

        if (this.docFormat.supportThumbnails()) {
            // only support rendering thumbnails for documents that have thumbnail
            // support.
            pagemarkRendererDelegates.push(new ThumbnailPagemarkRenderer(this));
        } else {
            console.warn("Thumbnails not enabled.");
        }

        this.pagemarkRenderer = new CompositePagemarkRenderer(this, pagemarkRendererDelegates);
        this.pagemarkRenderer.setup();

        this.updateProgress();

    }

    // FIXME: move to using PDFRenderer for this functionality.... getPageElementFromPageNum
    getPageElementByNum(num) {

        if(!num) {
            throw new Error("Page number not specified");
        }

        let pageElements = document.querySelectorAll(".page");

        // note that elements are 0 based indexes but our pages are 1 based
        // indexes.
        let pageElement = pageElements[num - 1];

        if(pageElement == null) {
            throw new Error("Unable to find page element for page num: " + num);
        }

        return pageElement;

    }

    onCreatePagemark(pagemarkEvent) {
        console.log("WebView.onCreatePagemark");

        console.log("Creating pagemark on page: " + pagemarkEvent.pageNum);

        this.pagemarkRenderer.create(pagemarkEvent.pageNum, pagemarkEvent.pagemark);
        this.updateProgress();

    }

    onErasePagemark(pagemarkEvent) {
        console.log("WebView.onErasePagemark");

        this.pagemarkRenderer.erase(pagemarkEvent.pageNum);
        this.updateProgress();

    }

    async recreatePagemarksFromPagemarks(pageElement, options) {

        let pageNum = this.getPageNum(pageElement);

        let docMeta = this.model.docMeta;

        let pageMeta = docMeta.pageMetas[pageNum];

        forDict(pageMeta.pagemarks, function (column, pagemark) {

            console.log("Creating pagemarks for page: " + pageNum);

            let recreatePagemarkOptions = Object.assign({}, options);

            recreatePagemarkOptions.pagemark = pagemark;

            this.recreatePagemark(pageElement, recreatePagemarkOptions);

        }.bind(this));

        //this.recreatePagemark(pageElement);

    }

    getPageNum(pageElement) {
        let dataPageNum = pageElement.getAttribute("data-page-number");
        return parseInt(dataPageNum);
    }

    recreatePagemark(pageElement, options) {

        if(! options.pagemark) {
            throw new Error("No pagemark.");
        }

        if( pageElement.querySelector(".pagemark") != null &&
            pageElement.querySelector(".canvasWrapper") != null &&
            pageElement.querySelector(".textLayer") != null ) {

            // Do not recreate the pagemark if:
            //   - we have a .pagemark element
            //   - we also have a .canvasWrapper and a .textLayer

            return;

        }

        // make sure to first remove all the existing pagemarks if there
        // are any
        this.erasePagemarks(pageElement);

        // we're done all the canvas and text nodes... so place the pagemark
        // back in again.

        this.createPagemark(pageElement, options);

    }

    /**
     * Create a pagemark on the given page which marks it read.
     * @param pageElement
     */
    createPagemark(pageElement, options) {

        // TODO: this code is ugly:
        //
        // - the options building can't be reliably tested
        //
        // - there are too many ways to compute the options
        //
        // - we PLACE the element as part of this function.  Have a secondary
        //   way to just CREATE the element so that we can test the settings
        //   properly.

        if(! options) {
            throw new Error("Options are required");
        }

        if(! options.pagemark) {
            throw new Error("Pagemark is required");
        }

        if(! options.pagemark.percentage) {
            throw new Error("Pagemark has no percentage");
        }

        if(! options.zIndex)
            options.zIndex = 0;

        if(! options.templateElement) {
            options.templateElement = pageElement;
        }

        if (! options.placementElement) {
            // TODO: move this to the object dealing with pages only.
            options.placementElement = pageElement.querySelector(".canvasWrapper, .iframeWrapper");
        }

        if(! options.templateElement) {
            throw new Error("No templateElement");
        }

        if(! options.placementElement) {
            throw new Error("No placementElement");
        }

        let pagemarkOptions = this.docFormat.pagemarkOptions();

        if (pagemarkOptions.zIndex) {
            options.zIndex = pagemarkOptions.zIndex;
        }

        if (pageElement.querySelector(".pagemark")) {
            // do nothing if the current page already has a pagemark.
            console.warn("Pagemark already exists");
            return;
        }

        let pagemarkElement = document.createElement("div");

        // set a pagemark-id in the DOM so that we can work with it when we use
        // the context menu, etc.
        pagemarkElement.setAttribute("data-pagemark-id", options.pagemark.id);

        // make sure we have a reliable CSS classname to work with.
        pagemarkElement.className="pagemark";

        //pagemark.style.backgroundColor="rgb(198, 198, 198)";
        pagemarkElement.style.backgroundColor="#00CCFF";
        pagemarkElement.style.opacity="0.3";

        pagemarkElement.style.position="absolute";
        pagemarkElement.style.left = options.templateElement.offsetLeft;
        pagemarkElement.style.top = options.templateElement.offsetTop;
        pagemarkElement.style.width = options.templateElement.style.width;

        // FIXME: the height should actually be a percentage of the pagemark
        // percentage.

        let height = Styles.parsePixels(options.templateElement.style.height);

        // FIXME: read the percentate coverage from the pagemark and adjust the
        // height to reflect the portion we've actually read.
        height = height * (options.pagemark.percentage / 100);

        pagemarkElement.style.height = `${height}px`;

        pagemarkElement.style.zIndex = `${options.zIndex}`;

        if (pagemarkOptions.requiresTransformForScale) {
            let currentScale = this.docFormat.currentScale();
            console.log("Adding transform to pagemark: " + currentScale);
            pagemarkElement.style.transform = `scale(${currentScale})`;
            pagemarkElement.style.transformOrigin = `center 0`;

            // we have to remove left and top...
            pagemarkElement.style.left = '';
            pagemarkElement.style.top = '';

        }

        if(!pagemarkElement.style.width)
            throw new Error("Could not determine width");

        options.placementElement.parentElement.insertBefore(pagemarkElement, options.placementElement);

    }

    redrawPagemark() {

    }

    erasePagemarks(pageElement) {

        if(!pageElement) {
            throw new Error("No pageElement");
        }

        console.log("Erasing pagemarks...");

        let pagemarks = pageElement.querySelectorAll(".pagemark");

        pagemarks.forEach(function (pagemark) {
            pagemark.parentElement.removeChild(pagemark);
            console.log("Erased pagemark.");
        });

        console.log("Erasing pagemarks...done");

    }

};
