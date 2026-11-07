// SPDX-License-Identifier: Apache-2.0

import { URI, UriComponents } from '../../../../base/common/uri.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IURLService } from '../../../../platform/url/common/url.js';
import { MainContext, MainThreadPlanishAgentLinksShape } from '../../../api/common/extHost.protocol.js';
import { extHostNamedCustomer, IExtHostContext } from '../../../services/extensions/common/extHostCustomers.js';

// Claude Code and Codex.
const AGENTS = ['anthropic.claude-code', 'openai.chatgpt'];

// Opens a link to Claude Code or Codex in the product's URL scheme without asking whether the
// extension may open it. Extensions reach this only through `vscode.env.openAgentLink`, behind
// the planishAgentLinks API proposal, which only built-in extensions may use: any extension can
// run a registered command, so this is not one.
@extHostNamedCustomer(MainContext.MainThreadPlanishAgentLinks)
export class MainThreadPlanishAgentLinks implements MainThreadPlanishAgentLinksShape {

	constructor(
		_context: IExtHostContext,
		@IURLService private readonly urlService: IURLService,
		@IProductService private readonly productService: IProductService,
	) { }

	async $open(components: UriComponents): Promise<boolean> {
		const uri = URI.revive(components);
		if (uri.scheme !== this.productService.urlProtocol || !AGENTS.some(id => ExtensionIdentifier.equals(id, uri.authority))) {
			throw new Error(`Not a link to Claude Code or Codex: ${uri.toString(true)}`);
		}
		return this.urlService.open(uri, { trusted: true });
	}

	dispose(): void { }
}
