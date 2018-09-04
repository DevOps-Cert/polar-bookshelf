import {IPersistenceLayer} from './datastore/PersistenceLayer';
import {DocMeta} from './metadata/DocMeta';
import {DocMetas} from './metadata/DocMetas';
import {Reactor} from './reactor/Reactor';
import {PagemarkType} from './metadata/PagemarkType';
import {Preconditions} from './Preconditions';
import {Pagemarks} from './metadata/Pagemarks';
import {Objects} from './util/Objects';
import {DocMetaDescriber} from './metadata/DocMetaDescriber';
import {Logger} from './logger/Logger';
import {TraceEvent} from './proxies/TraceEvent';
import {Batcher} from './datastore/batcher/Batcher';

const {Proxies} = require("./proxies/Proxies");

const log = Logger.create();

const NULL_DOC_META = DocMetas.create('0x0001', 0);

export class Model {

    private readonly persistenceLayer: IPersistenceLayer;

    // TODO: we should probably not set this via a global as it might not
    // be loaded yet and / or might be invalidated if the document is closed.
    //
    // TODO: we create a fake document which is eventually replaced.
    docMeta: DocMeta = NULL_DOC_META;

    reactor: any; // TODO: type

    docMetaPromise: Promise<DocMeta> = Promise.resolve(NULL_DOC_META);

    constructor(persistenceLayer: IPersistenceLayer) {

        this.persistenceLayer = persistenceLayer;

        this.reactor = new Reactor();
        this.reactor.registerEvent('documentLoaded');
        this.reactor.registerEvent('createPagemark');
        this.reactor.registerEvent('erasePagemark');

    }

    /**
     * Called when a new document has been loaded.
     */
    async documentLoaded(fingerprint: string, nrPages: number, currentPageNumber: number) {

        let docMeta = await this.persistenceLayer.getDocMeta(fingerprint);

        if(docMeta === undefined) {

            console.warn("New document found. Creating initial DocMeta");

            // this is a new document...
            //this.docMeta = DocMeta.createWithinInitialPagemarks(fingerprint, nrPages);
            docMeta = DocMetas.create(fingerprint, nrPages);
            await this.persistenceLayer.sync(fingerprint, docMeta);

            // I'm not sure this is the best way to resolve this as swapping in
            // the docMetaPromise without any synchronization seems like we're
            // asking for a race condition.

        }

        this.docMeta = docMeta;

        log.info("Description of doc loaded: " + DocMetaDescriber.describe(this.docMeta));
        log.info("Document loaded: ", fingerprint);

        let batcher = new Batcher(async () => {

            // right now we just sync the datastore on mutation.  We do not
            // attempt to use a journal yet.

            this.persistenceLayer.sync(this.docMeta.docInfo.fingerprint, this.docMeta)
                .catch(err => log.error("Unable to sync: ", err));
        });

        this.docMeta = Proxies.create(this.docMeta, (traceEvent: TraceEvent) => {

            log.info(`sync of persistence layer via deep trace due to path ${traceEvent.path} and property ${traceEvent.property}"`);

            setTimeout(() => {

                // use setTimeout so that we function in the same thread which
                // avoids concurrency issues with the batcher.

                batcher.enqueue().run()
                    .catch(err => log.error("Unable to commit to disk: ", err));

            }, 0);

            return true;

        });

        // always provide this promise for the metadata.  For NEW documents
        // we have to provide the promise but we ALSO have to provide it
        // to swap out the docMeta with the right version.
        this.docMetaPromise = Promise.resolve(docMeta);

        // TODO: make this into an object..
        let documentLoadedEvent = {fingerprint, nrPages, currentPageNumber, docMeta: this.docMeta};
        this.reactor.dispatchEvent('documentLoaded', documentLoadedEvent);

        return this.docMeta;

    }

    registerListenerForDocumentLoaded(eventListener: DocumentLoadedCallback) {
        this.reactor.addEventListener('documentLoaded', eventListener);
    }

    /**
     * @refactor This code should be in its own dedicated helper class
     *
     * @param pageNum The page num to use for our created pagemark.
     */
    async createPagemark(pageNum: number, options: any = {}) {

        if(!options.percentage) {
            options.percentage = 100;
        }

        log.info("Model sees createPagemark");

        this.assertPageNum(pageNum);

        let pagemark = Pagemarks.create({

            // just set docMeta pageMarkType = PagemarkType.SINGLE_COLUMN by
            // default for now until we add multiple column types and handle
            // them properly.

            type: PagemarkType.SINGLE_COLUMN,
            percentage: options.percentage,
            column: 0

        });

        let docMeta = await this.docMetaPromise;

        Pagemarks.updatePagemark(docMeta, pageNum, pagemark);

        // TODO: this can be done with a mutation listener now
        this.reactor.dispatchEvent('createPagemark', {pageNum, pagemark});

    }

    /**
     * @refactor This code should be in its own dedicated helper class
     * @param pageNum
     */
    erasePagemark(pageNum: number) {

        Preconditions.assertNumber(pageNum, "pageNum");

        log.info("Model sees erasePagemark");

        this.assertPageNum(pageNum);

        if(this.docMeta) {

            let pageMeta = this.docMeta.getPageMeta(pageNum);

            // FIXME: this is actually wrong because I need to delete the RIGHT
            // pagemark. NOT just delete all of them.
            Objects.clear(pageMeta.pagemarks);

            // FIXME: this can be done with a mutation listener now.
            this.reactor.dispatchEvent('erasePagemark', {pageNum});

        }

    }

    assertPageNum(pageNum: number) {

        if(pageNum == null)
            throw new Error("Must specify page pageNum");

        if(pageNum <= 0) {
            throw new Error("Page numbers begin at 1");
        }

    }

}

export interface DocumentLoadedEvent {
    readonly fingerprint: string;
    readonly nrPages: number;
    readonly currentPageNumber: number;
    readonly docMeta: DocMeta
}


export interface DocumentLoadedCallback {
    (event: DocumentLoadedEvent): void;
}

