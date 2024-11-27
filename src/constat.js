// a webcomponent that will be used to display the connection status of the user

/**
 * Represents the connection status of a WebSocket.
 * @class
 * @extends HTMLElement
 */
export default class ConnectionStatus extends HTMLElement {
    /**
     * Creates an instance of ConnectionStatus.
     * Initializes the shadow DOM and sets up the initial HTML structure and styles.
     */
    constructor() {
        super();
        this.socket = null;
        this.attachShadow({ mode: 'open' });
        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    padding: 0.5rem;
                    border-radius: 0.25rem;
                    margin: 0.5rem;
                    --ready: #d4edda;
                    --closed: #f8d7da;
                    --waiting: #fff3cd;
                }
            </style>
            <div class="status"></div>
            <div class="message"></div>
        `;
    }

    /**
     * Called when the element is added to the DOM.
     * Sets the role and aria-live attributes for accessibility.
     */
    connectedCallback() {
        this.setAttribute('role', 'status');
        this.setAttribute('aria-live', 'polite');
    }

    /**
     * Links a WebSocket (or PartySocket) to the ConnectionStatus element.
     * @param {WebSocket} socket - The WebSocket to link.
     */
    link(socket) {
        this.socket = socket;
        this.socket.addEventListener('open', this.onStateChange.bind(this));
        this.socket.addEventListener('close', this.onStateChange.bind(this));
        this.socket.addEventListener('error', this.onStateChange.bind(this));
        this.onStateChange();
    }

    updateStatus(message, status) {
        this.shadowRoot.querySelector('.status').style.backgroundColor = `var(--${status})`;
        this.shadowRoot.querySelector('.message').textContent = message;
    }
    /**
     * Handles state changes of the WebSocket.
     * This method should be implemented to update the status and message based on the WebSocket state.
     */
    onStateChange() {
        console.log('State changed:', this.socket.readyState);
        switch (this.socket.readyState) {
            case WebSocket.CONNECTING:
                this.updateStatus('Connecting', 'waiting');
                break;
            case WebSocket.OPEN:
                this.updateStatus('Connected', 'ready');
                break;
            case WebSocket.CLOSING:
            case WebSocket.CLOSED:
                this.updateStatus('Disconnected', 'error');
                break;
        }
    }
}
customElements.define('connection-status', ConnectionStatus);