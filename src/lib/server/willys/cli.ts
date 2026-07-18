#!/usr/bin/env node
import { WillysSession } from './session';
import { WillysClient } from './client';
import { WillysConfigError } from './config';
import os from 'node:os';
import path from 'node:path';

function log(msg: string): void {
	process.stderr.write(msg + '\n');
}
function out(data: unknown): void {
	process.stdout.write(JSON.stringify(data, null, 2) + '\n');
}

async function main(argv: string[]): Promise<number> {
	const [group, action, ...rest] = argv;
	const sessionFile = path.join(os.homedir(), '.willys-cli-session.json');
	const client = new WillysClient(new WillysSession(process.env, sessionFile));

	try {
		if (group === 'search') {
			const query = rest.join(' ') || action;
			if (!query) return usage();
			log(`Searching Willys for "${query}"…`);
			out(await client.search(query));
			return 0;
		}
		if (group === 'product' && action) {
			out(await client.product(action));
			return 0;
		}
		if (group === 'cart') {
			if (action === 'list' || !action) {
				out(await client.getCart());
				return 0;
			}
			if (action === 'add' && rest[0]) {
				const qty = rest[1] ? Number(rest[1]) : 1;
				log(`Adding ${rest[0]} ×${qty}…`);
				out(await client.addToCart(rest[0], qty));
				return 0;
			}
			if (action === 'remove' && rest[0]) {
				out(await client.removeFromCart(rest[0]));
				return 0;
			}
			if (action === 'clear') {
				out(await client.clearCart());
				return 0;
			}
		}
		return usage();
	} catch (err) {
		if (err instanceof WillysConfigError) {
			log(`Error: ${err.message}`);
			return 2;
		}
		log(`Error: ${err instanceof Error ? err.message : String(err)}`);
		return 1;
	}
}

function usage(): number {
	log(
		[
			'Usage:',
			'  willys search <query>',
			'  willys product <code>',
			'  willys cart list',
			'  willys cart add <code> [qty]',
			'  willys cart remove <code>',
			'  willys cart clear'
		].join('\n')
	);
	return 64;
}

main(process.argv.slice(2)).then((code) => process.exit(code));
