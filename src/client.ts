import { customAlphabet } from 'nanoid';
import PartySocket from "partysocket";
import dompurify from 'dompurify';
import MarkdownIt from 'markdown-it';
import { full as emoji } from 'markdown-it-emoji';
import twemoji from '@twemoji/api';
import ConnectionStatus from './connection-status';
import z from "zod";
import './style.css';

const md = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: true,
});
md.use(emoji);

// add link formating
md.renderer.rules.link_open = function(tokens, idx, options, env, self) {

    const href = tokens[idx].attrs ? tokens[idx].attrs[tokens[idx].attrs.length - 1][1] : '';
    return `<a href="${href}" target="_blank" rel="noopener noreferrer">`;
}
md.renderer.rules.link_close = function(tokens, idx, options, env, self) {
    return '<i class="fa-solid fa-arrow-up-right-from-square fa-xs link-decor"></i></a>';
}

document.getElementById('localstorage-consent-button')?.addEventListener('click', () => {
    localStorage.setItem('consent', 'true');
    document.getElementById('localstorage-consent')?.remove();
});
if (localStorage.getItem('consent')) {
    document.getElementById('localstorage-consent')?.remove();
}

const ChatMessage = z.object({
    type: z.literal('chat'),
    message: z.string(),
    username: z.string(),
    nickname: z.optional(z.string()),
    timestamp: z.date({coerce: true}),
});

const ErrorMessage = z.object({
    type: z.literal('error'),
    message: z.string(),
    timestamp: z.optional(z.date({coerce: true})),
});
const JoinMessage = z.object({
    type: z.literal('join'),
    username: z.string(),
    timestamp: z.date({coerce: true}),
});
const LeaveMessage = z.object({
    type: z.literal('leave'),
    username: z.string(),
    timestamp: z.date({coerce: true}),
});
const SystemMessage = z.object({
    type: z.literal('system'),
    message: z.any(),
    timestamp: z.date({coerce: true}),
});
const UpdateChatMessage = z.object({
    type: z.literal('messages'),
    messages: z.array(z.union([JoinMessage, LeaveMessage, ChatMessage])),
});
const CalmMessage = z.object({
    type: z.literal('calm'),
});
const ServerMessage = z.union([
    ErrorMessage, JoinMessage, LeaveMessage, UpdateChatMessage, ChatMessage, SystemMessage, CalmMessage
]);

const tips: string[] = [
    "Use !move to change rooms",
    "Have fun!",
    "Use !help for info on commands",
    "Be nice!",
    "Use !list to list all users",
    "Ask for help if you need it",
    "[Markdown](https://www.markdownguide.org/basic-syntax/) is supported", // Odd: removed during conversion to ts (copilot bug?)
];
let tipsIndex = Math.floor(Math.random() * tips.length);
const chatTip = document.getElementById('chat-tip') as HTMLElement;
chatTip.innerHTML = md.renderInline(tips[tipsIndex]);
document.getElementById('chat-tip-container')?.addEventListener('click', () => {
    tipsIndex = (tipsIndex + 1) % tips.length;
    const chatTipElement = document.getElementById('chat-tip');
    if (chatTipElement) {
        chatTipElement.animate([
            { opacity: 1 },
            { opacity: 0 },
        ], {
            duration: 200,
            fill: 'forwards',
        }).onfinish = () => {
            chatTip.innerHTML = md.renderInline(tips[tipsIndex]);
            document.getElementById('chat-tip')?.animate([
                { opacity: 0 },
                { opacity: 1 },
            ], {
                duration: 200,
                fill: 'forwards',
            });
        };
    }
});

//

//

// https://stackoverflow.com/a/52171480
const cyrb53 = (str: string, seed = 0): number => {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for(let i = 0, ch; i < str.length; i++) {
        ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1  = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2  = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
};

function stamp(): string {
    return new Date().toISOString();
}
function humanize(date: string | Date): string {
    if (typeof date === 'string') {
        date = new Date(date);
    }
    return date.toLocaleDateString()+' '+date.toLocaleTimeString();
}

function timestamp2html(timestamp: string): string {
    return `<time datetime="${timestamp}">${humanize(timestamp)}</time>`;
}

function usernameColor(username: string, seed = 0): string {
    const hue = cyrb53(username, seed) % 360;
    return `hsl(${hue}, 50%, 50%)`;
}
const highlightPings = (message: string): string => {
    // Find all occurrences of @username and wrap them in a span
    let result = message;
    const containerdoc = document.createDocumentFragment();
    const container = document.createElement('div');
    containerdoc.appendChild(container);
    container.innerHTML = message;
    console.log(container, message);
    // Find all occurrences of @username in element text and wrap them in a span
    containerdoc.querySelectorAll('*').forEach((node) => {
        if (node.children.length <= 0 && node.textContent) {
            const parts = node.textContent.split(/(@\w+)/g);
            console.log(parts);
            node.textContent = '';
            parts.map((part) => {
                if (part.startsWith('@')) {
                    console.log('found ping', part);
                    const span = document.createElement('span');
                    span.className = 'ping user';
                    span.textContent = part;
                    span.dataset.user = part.substring(1);
                    console.log(span);
                    return span;
                } else {
                    return document.createTextNode(part);
                }
            }).forEach((part) => {
                node.appendChild(part);
            });
        }
    });
    console.log(containerdoc, container, containerdoc.textContent);
    result = container.innerHTML;
    return result;
}

const alphabet = '6789BCDFGHJKLMNPQRTWbcdfghjkmnpqrtwz';
const nanoid = customAlphabet(alphabet, 8);

let room = localStorage.getItem('room');
if (!room) {
    room = 'chat';
    localStorage.setItem('room', room);
}

const socket = new PartySocket({
    host: location.host,
    room: room,
    id: localStorage.getItem('nickname') || nanoid(),
});
(document.querySelector('connection-status') as ConnectionStatus).link(socket);

const log_message = (msg: { message: string, username: string, timestamp: string }): HTMLElement => {
    const el = document.createElement('div');  
    const sanitizedMessage = dompurify.sanitize(md.renderInline(msg.message));
    const parsedMessage = highlightPings(twemoji.parse(sanitizedMessage));
    el.innerHTML = `${timestamp2html(msg.timestamp)} - <span class="user" data-user="${msg.username}">${msg.username}</span>: ${parsedMessage}`;
    el.className = 'message';
    chat.appendChild(el);
    return el;
}
const sys_message = (msg: string, extraclasses: string | undefined = undefined): HTMLElement => {
    const el = document.createElement('div');
    el.innerHTML = dompurify.sanitize(msg);
    el.className = 'message system'+(extraclasses ? ' '+extraclasses : '');
    chat.appendChild(el);
    return el;
}

const chat = document.getElementById('chat') as HTMLElement;
const form = document.getElementById('chat-form') as HTMLFormElement;

form.addEventListener('submit', (event: Event) => {
    event.preventDefault();
    const input = form.querySelector('input') as HTMLInputElement;
    const msg = { type: 'chat', message: input.value, username: socket.id, timestamp: stamp() };
    console.log(msg);
    log_message(msg).scrollIntoView({ block: 'start' });
    if (input.value.startsWith('!')) {
        const parts = input.value.split(' ');
        switch (parts[0]) {
            case '!move':
                let room;
                if (parts.length <= 2) {
                    room = parts[1];
                } else {
                    room = 'chat';
                }
                socket.updateProperties({ room });
                localStorage.setItem('room', room);
                document.getElementById('chat-room')!.textContent = 'Loading...';
                document.getElementById('chat-room')!.style.color = 'unset';
                socket.reconnect();
                input.value = '';
                return;
            case '!help':
                if (parts.length === 2) {
                    const command = parts[1];
                    if (command === 'move') {
                        sys_message(`${timestamp2html(stamp())} - <span class="user">CLIENT</span>: Commands: !move [room]`);
                    }
                    if (command === 'help') {
                        sys_message(`${timestamp2html(stamp())} - <span class="user">CLIENT</span>: Commands: !help [command]`);
                    }
                } else {
                    sys_message(`${timestamp2html(stamp())} - <span class="user">CLIENT</span>: Commands: !move, !help`);
                }
            
        }
    }
    input.value = '';
    socket.send(JSON.stringify(msg));
});

socket.addEventListener('open', () => {
    const chatId = document.getElementById('chat-id') as HTMLElement;
    chatId.textContent = socket.id;
    chatId.style.color = usernameColor(socket.id);
    const chatRoom = document.getElementById('chat-room') as HTMLElement;
    chatRoom.textContent = socket.room ?? '';
    chatRoom.style.color = usernameColor(socket.room ?? '', 7);

    console.log('Connected to chat server');
});

socket.addEventListener('message', (message: MessageEvent) => {
    console.log('Received message:', message.data);
    const result = ServerMessage.safeParse(JSON.parse(message.data));
    if (!result.success) {
        console.error('Invalid message:', message.data);
        return;
    }
    const handleMessage = (msg: any) => {
        const { type, ...data } = msg;
        if (type === 'chat') {
            log_message(data);
        }
        if (type === 'error') {
            sys_message(`${timestamp2html(data.timestamp)} - <span class="user">SYSTEM (ERROR)</span>: ${data.message}`, 'error');
        }
        if (type === 'join') {
            sys_message(`${timestamp2html(data.timestamp)} - <span class="user" data-user="${data.username}">${data.username}</span> joined the chat`);
        }
        if (type === 'leave') {
            sys_message(`${timestamp2html(data.timestamp)} - <span class="user" data-user="${data.username}">${data.username}</span> left the chat`);
        }
        if (type === 'system') {
            sys_message(`${timestamp2html(data.timestamp)} - <span class="user">SYSTEM</span>: ${data.message}`);
        }
        if (type === 'messages') {
            chat.innerHTML = '';
            for (const msg of data.messages) {
                handleMessage(msg);
            }
        }
    }
    handleMessage(result.data);
});

// username colors
const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
                const element = node as HTMLElement;
                if (element.classList.contains('user') && element.dataset.user) {
                    element.style.setProperty('--user-color', usernameColor(element.dataset.user));
                }
                element.querySelectorAll('[data-user].user').forEach(user => {
                    if (user) {
                        // set color based on username hash
                        (user as HTMLElement).style.setProperty('--user-color', usernameColor((user as HTMLElement).dataset.user!));
                    }
                });                
            }
        }
    }
});
observer.observe(chat, { childList: true, subtree: true });
(() => {
    window.addEventListener('message', (event) => {
        if (event.data === 'ready') {
            window.parent.postMessage('ready', '*');
        }
    });
    window.parent.postMessage('ready', '*');
})();