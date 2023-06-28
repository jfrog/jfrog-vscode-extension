import * as sinon from 'sinon';
import { EventSender } from '../../../../main/webview/event/eventSender';
import { IDependencyPage, WebviewPage, WebviewReceiveEventType } from 'jfrog-ide-webview';
import { MockWebview } from '../mockWebview.test';

describe('EventSender', () => {
    let webview: MockWebview;
    let postMessageStub: sinon.SinonStub;

    beforeEach(() => {
        webview = new MockWebview();
        postMessageStub = webview.postMessage as sinon.SinonStub;
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('setEventEmitter', () => {
        it('should send a SetEmitter event to the webview', async () => {
            new EventSender(webview);
            sinon.assert.callCount(postMessageStub, 1);
            sinon.assert.calledWithMatch(postMessageStub, {
                type: 'SET_EMITTER',
                emitterFunc: 'return acquireVsCodeApi().postMessage'
            });
        });
    });

    describe('loadPage', () => {
        it('should send a ShowPage event with the provided page data to the webview', async () => {
            const eventSender: EventSender = new EventSender(webview);
            const mockPageData: WebviewPage = { id: 'XRAY-MOCK', extendedInformation: { shortDescription: 'mock-text' } } as IDependencyPage;

            await eventSender.loadPage(mockPageData);

            // The first call in 'new EventSender' and the second in 'loadPage'
            sinon.assert.callCount(postMessageStub, 2);
            sinon.assert.calledWithMatch(postMessageStub, {
                type: WebviewReceiveEventType.ShowPage,
                pageData: mockPageData
            });
        });
    });
});
