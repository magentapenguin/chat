import { customAlphabet } from 'nanoid';
import PartySocket from "partysocket";
import dompurify from 'dompurify';
import MarkdownIt from 'markdown-it';
import './constat.js';
import z from "zod";

const ChatMessage = z.object({
    type: z.literal('chat'),
    message: z.string(),
    username: z.string(),
    timestamp: z.date({coerce: true}),
});

const ErrorMessage = z.object({
    type: z.literal('error'),
    message: z.string(),
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
const UpdateChatMessage = z.object({
    type: z.literal('messages'),
    messages: z.array(z.union([JoinMessage, LeaveMessage, ChatMessage])),
});
const ServerMessage = z.union([
    ErrorMessage, JoinMessage, LeaveMessage, UpdateChatMessage, ChatMessage
]);

function stamp() {
    return new Date().toISOString();
}
function humanize(date) {
    if (typeof date === 'string') {
        date = new Date(date);
    }
    return date.toLocaleDateString()+' '+date.toLocaleTimeString();
}

function timestamp2html(timestamp) {
    return `<time datetime="${timestamp}">${humanize(timestamp)}</time>`;
}

function usernameColor(username) {
    const hue = username.split('').reduce((acc, c) => c.charCodeAt(0) + acc, 0) % 360;
    return `hsl(${hue}, 50%, 50%)`;
}
const alphabet = '6789BCDFGHJKLMNPQRTWbcdfghjkmnpqrtwz';
const nanoid = customAlphabet(alphabet, 8);
const md = new MarkdownIt();

const socket = new PartySocket({
    host: location.host,
    room: 'chat',
    id: nanoid()
});
document.querySelector('connection-status').link(socket);

const log_message = (msg) => {
    const el = document.createElement('div');
    msg = Object.assign(msg, { message: dompurify.sanitize(md.renderInline(msg.message)) });  
    msg = `${timestamp2html(msg.timestamp)} - <span class="user" data-user="${msg.username}">${msg.username}</span>: ${msg.message}`;
    el.innerHTML = msg;
    el.className = 'message';
    chat.appendChild(el);
}
const sys_message = (msg) => {
    const el = document.createElement('div');
    el.innerHTML = dompurify.sanitize(msg);
    el.className = 'message system';
    chat.appendChild(el);
}


const chat = document.getElementById('chat');
const form = document.getElementById('chat-form');

form.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = form.querySelector('input');
    let msg = { type: 'chat', message: input.value, username: socket.id, timestamp: stamp() };
    socket.send(JSON.stringify(msg));
    input.value = '';
    log_message(msg);
});

socket.addEventListener('open', () => {
    const chatId = document.getElementById('chat-id');
    chatId.textContent = socket.id;
    chatId.style.color = usernameColor(socket.id);
    
    console.log('Connected to chat server');
});

socket.addEventListener('message', (message) => {
    console.log('Received message:', message.data);
    const result = ServerMessage.safeParse(JSON.parse(message.data));
    if (!result.success) {
        console.error('Invalid message:', message.data);
        return;
    }
    const handleMessage = (msg) => {
        const { type, ...data } = msg;
        if (type === 'chat') {
            log_message(data);
        }
        if (type === 'join') {
            sys_message(`${timestamp2html(data.timestamp)} - <span class="user" data-user="${data.username}">${data.username}</span> joined the chat`);
        }
        if (type === 'leave') {
            sys_message(`${timestamp2html(data.timestamp)} - <span class="user" data-user="${data.username}">${data.username}</span> left the chat`);
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
                if (node.classList.contains('user')) {
                    node.style.color = usernameColor(node.dataset.user);
                }
                const user = node.querySelector('.user');

                if (user) {
                    // set color based on username hash
                    user.style.color = usernameColor(user.dataset.user);
                }
            }
        }
    }
});
observer.observe(chat, { childList: true, subtree: true });