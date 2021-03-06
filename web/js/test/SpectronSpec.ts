import {assert} from 'chai';
import {TApplication} from './Spectron';
import {WebDriverTestResultReader} from './results/reader/WebDriverTestResultReader';
import {Concurrently} from '../util/Concurrently';

/**
 * Allows us to easily await for the test to finish.
 */
export class SpectronSpec {

    private readonly app: TApplication;

    constructor(app: TApplication) {
        this.app = app;
    }

    public async waitFor(val: any) {

        // wait for at least one window (which is the main one that will hold our value)
        await Concurrently.waitForPredicate(() => this.app.client.getWindowCount(),
                                            (windowCount: number) => windowCount >= 1 );

        let testResultReader = new WebDriverTestResultReader(this.app);
        assert.equal(await testResultReader.read(), val);

    }

    public static create(app: TApplication) {
        return new SpectronSpec(app);
    }

}
