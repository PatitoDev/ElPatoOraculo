import { InteractionResponseType, InteractionType } from "discord-interactions";
import nacl from "tweetnacl";
import { Buffer } from 'node:buffer';
import { DiscordApplicationCommand, DiscordInteractionRequest, DiscordInteractionResponse } from "./types";
import { DuckApi } from "./api/duckApi";
import { pushToWebhook } from "./api/discordWebhook";

export interface Env {
	PUBLIC_KEY: string
	WEBHOOK_URL: string | undefined
}

const verifyRequest = async (body: string, request: Request, env: Env, ctx: ExecutionContext) => {
	const signature = request.headers.get('x-signature-ed25519');
	const timestamp = request.headers.get('x-signature-timestamp');

	if (!signature || !timestamp || !body) throw new Error('invalid request');
	const isValid = nacl.sign.detached.verify(
		Buffer.from(timestamp + body),
		Buffer.from(signature, 'hex'),
		Buffer.from(env.PUBLIC_KEY, 'hex')
	);

	if (!isValid) throw new Error('invalid request');
}

export default {
	async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
		if (env.WEBHOOK_URL) {
			const randomDuckUrl = await DuckApi.getRandomDuckUrl();
			const payload = {
				embeds: [
					{ image: { url: randomDuckUrl } }
				]
			};
			ctx.waitUntil(pushToWebhook(env.WEBHOOK_URL, payload));
		}
	},
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const bodyAsText = await request.text();

		try {
			await verifyRequest(bodyAsText, request, env, ctx);
		} catch(ex) {
			return new Response('Bad request signature', {
				status: 401
			});
		}

		const { data, id, type } = JSON.parse(bodyAsText) as DiscordInteractionRequest;

		if (type === InteractionType.PING) {
			const resp: DiscordInteractionResponse = {
				type: InteractionResponseType.PONG
			};

			return new Response(JSON.stringify(resp), {
				headers: new Headers({
					'content-type': 'application/json'
				})
			});
		}

		if (type === InteractionType.APPLICATION_COMMAND) {
			const { name } = data as DiscordApplicationCommand;

			let randomDuckUrl = (name === 'quack') 
				? await DuckApi.getRandomDuckUrl() 
				: DuckApi.duckErrorCodeUrl(501);

			const resp = {
				type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
				data: {
					embeds: [{
						image: { url: randomDuckUrl },
					}]
				},
			};

			return new Response(JSON.stringify(resp), {
				headers: new Headers({
					'content-type': 'application/json'
				})
			});
		}

		return new Response('Get off my api D:', {
			status: 501
		});
	},
};
