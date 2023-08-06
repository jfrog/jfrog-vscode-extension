import * as sinon from 'sinon';
import { EventSender } from '../../../../main/webview/event/eventSender';
import { IDependencyPage, IdeEventType, WebviewPage } from 'jfrog-ide-webview';
import { MockWebview } from '../mockWebview.test';
import { LogManager } from '../../../../main/log/logManager';

describe('EventSender', () => {
    let webview: MockWebview;
    let postMessageStub: sinon.SinonStub;
    const mockLogger: LogManager = new LogManager().activate();
    beforeEach(() => {
        webview = new MockWebview();
        postMessageStub = webview.postMessage as sinon.SinonStub;
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('setEventEmitter', () => {
        it('Send event to the webview', async () => {
            new EventSender(webview, mockLogger);
            sinon.assert.callCount(postMessageStub, 1);
            sinon.assert.calledWithMatch(postMessageStub, {
                type: 'SET_EMITTER',
                data: 'return acquireVsCodeApi().postMessage'
            });
        });
    });

    describe('loadPage', () => {
        it('Send a ShowPage event', async () => {
            const eventSender: EventSender = new EventSender(webview, mockLogger);
            const mockPageData: WebviewPage = { id: 'XRAY-MOCK', extendedInformation: { shortDescription: 'mock-text' } } as IDependencyPage;
            await eventSender.loadPage(mockPageData);

            // The first call in 'new EventSender' and the second in 'loadPage'
            sinon.assert.callCount(postMessageStub, 2);
            sinon.assert.calledWithMatch(postMessageStub, {
                type: IdeEventType.ShowPage,
                pageData: mockPageData
            });
        });
    });
});
