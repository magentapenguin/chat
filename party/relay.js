import z from "zod";

const ChatMessage = z.object({
    type: z.literal('chat'),
    message: z.string(),
    username: z.string(),
    timestamp: z.date({ coerce: true }),
});

const ErrorMessage = z.object({
    type: z.literal('error'),
    message: z.string(),
    timestamp: z.optional(z.date({ coerce: true })),
});
const JoinMessage = z.object({
    type: z.literal('join'),
    username: z.string(),
    timestamp: z.date({ coerce: true }),
});
const LeaveMessage = z.object({
    type: z.literal('leave'),
    username: z.string(),
    timestamp: z.date({ coerce: true }),
});
const SystemMessage = z.object({
    type: z.literal('system'),
    message: z.any(),
    timestamp: z.date({ coerce: true }),
});
const UpdateChatMessage = z.object({
    type: z.literal('messages'),
    messages: z.array(z.union([JoinMessage, LeaveMessage, ChatMessage])),
});
const ClientMessage = ChatMessage;/*z.union([
    ChatMessage
]);*/
const ServerMessage = z.union([
    ErrorMessage, JoinMessage, LeaveMessage, UpdateChatMessage, ChatMessage, SystemMessage
]);

function stamp() {
    return new Date().toISOString();
}

export default class RelayServer {
    constructor(room) {
        this.room = room;
        this.messages = [];
    }
    commands = {
        "/clear": (server, msg, sender, input) => {
            server.messages = [];
            server.syncMessages(true)
            server.room.broadcast(JSON.stringify({ type: 'messages', messages: server.messages }));
            return { type: 'info', message: 'Messages cleared' };
        },
        "/help": (server, msg, sender, input) => {
            return { type: 'info', message: 'Commands: /clear, /help' };
        },
        "/list": async (server, msg, sender, input) => {
            const formatuser = (user) => {
                return `<span class="user" data-user="${user}">${user}</span>`;
            }
            let users = [...this.room.getConnections()].map((conn) => conn.id);
            let userlist = users.map(formatuser).join(', ');
            return { type: 'info', message: `Users: ${userlist}` };
        }
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
        let preventSend = false;
        let extraData;
        if (data.type === 'chat') {
            this.messages.push(data);
            this.syncMessages();
            if (data.message.startsWith('/')) {
                const parts = data.message.split(' ');
                const command = parts[0];
                if (this.commands[command]) {
                    let out;
                    try {
                        out = this.commands[command](this, message, sender, parts);
                    } catch (err) {
                        console.error(err);
                        sender.send(JSON.stringify({ type: 'error', message: 'An error occurred while processing the command', timestamp: stamp() }));
                        return;
                    }
                    console.log(out);
                    if (out instanceof Promise) {
                        out.then((result) => {
                            console.log(result);
                            if (result.type === 'info') {
                                extraData = { type: 'system', message: result.message, timestamp: stamp() }
                            }
                            if (result.type === 'error') {
                                preventSend = true;
                                sender.send(JSON.stringify({ type: 'error', message: result.message, timestamp: stamp() }));
                            }
                        }).catch((err) => {
                            console.error(err);
                            preventSend = true;
                            sender.send(JSON.stringify({ type: 'error', message: 'An error occurred while processing the command', timestamp: stamp() }));
                        });
                    }
                    if (out.type === 'info') {
                        extraData = JSON.stringify({ type: 'system', message: out.message, timestamp: stamp() });
                        
                    }
                    if (out.type === 'error') {
                        preventSend = true;
                        sender.send(JSON.stringify({ type: 'error', message: out.message, timestamp: stamp() }));
                    }
                }
            }
        }
        if (!preventSend) this.room.broadcast(JSON.stringify(data), [sender.id]);
        if (extraData && !preventSend) this.room.broadcast(JSON.stringify(extraData));
    }
    onReady() {
        this.syncMessages();
    }
    static getCountry(connection) {
        const country = (ctx.request.cf?.country) ?? "unknown";
        return [country];
    }
    // when a new client connects
    async onConnect(connection) {
        const data = { type: 'join', username: connection.id, timestamp: stamp() };
        this.room.broadcast(JSON.stringify(data), [connection.id]);
        this.messages.push(data);
        await this.syncMessages();
        connection.send(JSON.stringify({ type: 'messages', messages: this.messages }));
    }
    // when a client disconnects
    onClose(connection) {
        const data = { type: 'leave', username: connection.id, timestamp: stamp() };
        this.room.broadcast(JSON.stringify(data), [connection.id]);
        this.messages.push(data);
        this.syncMessages();
    }
    async syncMessages(force = false, update = false) {
        if ((!this.messages || this.messages.length <= 0 || update) && !force) {
            this.messages = await this.room.storage.get('messages');
        }
        await this.room.storage.put('messages', this.messages);
    }
}