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
                    position: fixed;
                    top: 0;
                    right: 0;
                    font-size: small;
                    text-transform: uppercase;
                    background-color: #fff;
                    border: 2px solid #ccc;
                    color: #aaa;
                    padding: 0.1em 0.5em;
                    padding-left: 0.25em;
                    border-radius: 1em;
                    margin: 0.5rem;
                    --ready: #00ff3c;
                    --closed: #ff0015;
                    --waiting: #ffc400;
                    box-shadow: 0 0.5em 1em #00000023;
                    display: flex;
                    align-items: center;
                }
                @media ( prefers-color-scheme: dark ) {
                    :host {
                        border: 2px solid #555;
                        background-color: #333;
                        color: #888;
                        box-shadow: 0 0.5em 1em #0000007c;
                    }
                }
                .status {
                    width: 1rem;
                    height: 1rem;
                    border-radius: 50%;
                    margin-right: 0.2rem;
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
                this.updateStatus('Disconnected', 'closed');
                break;
        }
    }
}
customElements.define('connection-status', ConnectionStatus);