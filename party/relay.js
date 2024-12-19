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
const ClientMessage = ChatMessage;/*z.union([
    ChatMessage
]);*/
const ServerMessage = z.union([
    ErrorMessage, JoinMessage, LeaveMessage, UpdateChatMessage, ChatMessage
]);

function stamp() {
    return new Date().toISOString();
}

export default class RelayServer {
    constructor(room) {
        this.room = room;
        this.messages = [];
    }
    // when a client sends a message
    onMessage(message, sender) {
        const result = ClientMessage.safeParse(JSON.parse(message));
        if (!result.success) {
            console.error(result.error);
            sender.send(JSON.stringify({ type: 'error', message: 'Invalid message' }));
            return;
        }
        const data = result.data;
        if (data.type === 'chat') {
            this.messages.push(data);
            this.syncMessages();
        }
        this.room.broadcast(JSON.stringify(data), [sender.id]);
    }
    onReady() {
        this.syncMessages();
    }
    // when a new client connects
    async onConnect(connection) {
        const data = { type: 'join', username: connection.id, timestamp: stamp() };
        this.room.broadcast(JSON.stringify(data), [connection.id]);
        this.messages.push(data);
        this.syncMessages();
        connection.send(JSON.stringify({ type: 'messages', messages: this.messages }));
    }
    // when a client disconnects
    onClose(connection) {
        const data = { type: 'leave', username: connection.id, timestamp: stamp() };
        this.room.broadcast(JSON.stringify(data), [connection.id]);
        this.messages.push(data);
        this.syncMessages();
    }
    async syncMessages() {
        if (this.room.storage.has('messages') && this.room.storage.get('messages').length === 0) {
            this.messages = await this.room.storage.get('messages');
        }
        await this.room.storage.put('messages', this.messages);
    }
}