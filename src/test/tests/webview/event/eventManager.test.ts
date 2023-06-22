import { IDependencyPage, WebviewPage } from 'jfrog-ide-webview';
import { EventManager } from '../../../../main/webview/event/eventManager';
import { MockWebview } from '../mockWebview.test';
import * as sinon from 'sinon';
import { ConnectionManager } from '../../../../main/connect/connectionManager';
import { LogManager } from '../../../../main/log/logManager';

describe('EventManager', () => {
    let webview: MockWebview;
    let eventManager: EventManager;
    let loadPageStub: any;
    beforeEach(() => {
        webview = new MockWebview();
        eventManager = new EventManager(webview, {} as ConnectionManager, {} as LogManager);
        loadPageStub = sinon.stub(eventManager, 'loadPage').resolves();
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('loadPage', () => {
        it('should call the send.loadPage method with the provided page data', () => {
            const mockPageData: WebviewPage = { id: 'XRAY-MOCK1', extendedInformation: { shortDescription: 'mock-text1' } } as IDependencyPage;

            eventManager.loadPage(mockPageData);

            // Assert that the send.loadPage method was called with the provided page data
            sinon.assert.calledWith(loadPageStub, mockPageData);
        });
    });
});
