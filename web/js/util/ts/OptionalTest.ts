import {assert} from 'chai';
import {Optional} from './Optional';

describe('Optional', function() {

    it("Test nullable object", function () {

        // test to make sure we can pass in a nullable option defined as part
        // of the type and that we can map it without any type issues.

        interface State {
            zip: string
        }

        let state: State | null = {
            zip: "94107"
        };

        let zip = Optional.of(state)
            .map(current => current.zip)
            .map(current => parseInt(current))
            .get();

        assert.equal(zip, 94107);

    });

    it("Change type within map function", function () {

        let value = Optional.of('100')
            .map(current => parseInt(current))
            .filter(current => current === 100)
            .get();

        assert.equal(value, 100);

    });


});
