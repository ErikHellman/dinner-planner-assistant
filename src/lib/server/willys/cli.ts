#!/usr/bin/env node
import { WillysSession } from './session';
import { WillysClient } from './client';
import { WillysConfigError } from './config';
import { PlanStore } from '../plans/store';
import { currentWeekId, parseWeekId } from '../../plans/week';
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
			const query = argv.slice(1).join(' ');
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
				if (!Number.isFinite(qty) || qty < 0) {
					log('qty must be a non-negative number');
					return 64;
				}
				log(`Setting ${rest[0]} to ×${qty}…`);
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
			if (action === 'record') {
				let week = currentWeekId();
				if (rest[0] === '--week' && rest[1]) {
					if (!parseWeekId(rest[1])) {
						log(`--week must be an ISO week id like ${week}`);
						return 64;
					}
					week = rest[1];
				} else if (rest.length > 0) {
					return usage();
				}
				const cart = await client.getCart();
				if (cart.lines.length === 0) {
					log('The Willys cart is empty — nothing to record.');
					return 1;
				}
				const plan = await new PlanStore().setWillysSnapshot(week, {
					recordedAt: new Date().toISOString(),
					store: cart.store,
					itemCount: cart.itemCount,
					totalQuantity: cart.totalQuantity,
					lines: cart.lines,
					subtotal: cart.subtotal,
					// The CLI has no idea which ingredient each product was bought for;
					// only the agent knows that, so the week reads as "not recorded".
					coverage: []
				});
				log(`Recorded the cart into the ${week} plan`);
				out(plan);
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
			'  willys cart list               (default for "cart")',
			'  willys cart add <code> [qty]   (sets exact quantity)',
			'  willys cart remove <code>',
			'  willys cart clear',
			'  willys cart record [--week 2026-W30]   (snapshot cart into the weekly plan)'
		].join('\n')
	);
	return 64;
}

main(process.argv.slice(2))
	.then((code) => process.exit(code))
	.catch((err) => {
		process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
		process.exit(1);
	});
