// SPDX-License-Identifier: Apache-2.0

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { platform } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { EXTENSION_INSTALL_SKIP_WALKTHROUGH_CONTEXT, IExtensionGalleryService, InstallExtensionInfo } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { areSameExtensions } from '../../../../platform/extensionManagement/common/extensionManagementUtil.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { MainContext, MainThreadPlanishProfileImportShape, PlanishProfileDataDto } from '../../../api/common/extHost.protocol.js';
import { IWorkbenchExtensionManagementService } from '../../../services/extensionManagement/common/extensionManagement.js';
import { extHostNamedCustomer, IExtHostContext } from '../../../services/extensions/common/extHostCustomers.js';
import { KeybindingsResource } from '../../../services/userDataProfile/browser/keybindingsResource.js';
import { SettingsResource } from '../../../services/userDataProfile/browser/settingsResource.js';
import { SnippetsResource } from '../../../services/userDataProfile/browser/snippetsResource.js';
import { TasksResource } from '../../../services/userDataProfile/browser/tasksResource.js';
import { IUserDataProfileImportExportService, IUserDataProfileService, IUserDataProfileTemplate } from '../../../services/userDataProfile/common/userDataProfile.js';

// Imports another editor's setup through VS Code's own profile import, which extensions cannot
// reach. Extensions reach this only through `vscode.env.importIntoProfile` and
// `vscode.env.createProfile`, behind the planishProfileImport API proposal, which only built-in
// extensions may use.
@extHostNamedCustomer(MainContext.MainThreadPlanishProfileImport)
export class MainThreadPlanishProfileImport implements MainThreadPlanishProfileImportShape {

	constructor(
		_context: IExtHostContext,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IExtensionGalleryService private readonly galleryService: IExtensionGalleryService,
		@IWorkbenchExtensionManagementService private readonly extensionManagementService: IWorkbenchExtensionManagementService,
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
		@IUserDataProfileImportExportService private readonly importExportService: IUserDataProfileImportExportService,
	) { }

	async $importIntoProfile(data: PlanishProfileDataDto): Promise<string[]> {
		const profile = this.userDataProfileService.currentProfile;
		const template = toTemplate(profile.name, data);
		if (template.settings) {
			await this.instantiationService.createInstance(SettingsResource).apply(template.settings, profile);
		}
		if (template.keybindings) {
			await this.instantiationService.createInstance(KeybindingsResource).apply(template.keybindings, profile);
		}
		if (template.tasks) {
			await this.instantiationService.createInstance(TasksResource).apply(template.tasks, profile);
		}
		if (template.snippets) {
			await this.instantiationService.createInstance(SnippetsResource).apply(template.snippets, profile);
		}
		return this.install(data.extensions ?? [], profile.extensionsResource);
	}

	// Installs the extensions beside those the profile has, where VS Code's import would remove
	// those, after one question about their publishers. Returns the IDs not installed.
	private async install(ids: readonly string[], profileLocation: URI): Promise<string[]> {
		if (!ids.length) {
			return [];
		}
		const found = await this.galleryService.getExtensions(ids.map(id => ({ id })), CancellationToken.None);
		const infos: InstallExtensionInfo[] = found.map(extension => ({
			extension,
			options: { isMachineScoped: false, profileLocation, context: { [EXTENSION_INSTALL_SKIP_WALKTHROUGH_CONTEXT]: true } },
		}));
		if (!infos.length) {
			return [...ids];
		}
		try {
			await this.extensionManagementService.requestPublisherTrust(infos);
		} catch {
			// The user did not trust them.
			return [...ids];
		}
		const results = await this.extensionManagementService.installGalleryExtensions(infos);
		return ids.filter(id => !results.some(result => result.local && areSameExtensions(result.identifier, { id })));
	}

	async $createProfile(name: string, data: PlanishProfileDataDto): Promise<boolean> {
		return !!await this.importExportService.createProfileFromTemplate(toTemplate(name, data), {}, CancellationToken.None);
	}

	dispose(): void { }
}

// The profile template VS Code's export writes, which wraps each file's text in JSON.
function toTemplate(name: string, data: PlanishProfileDataDto): IUserDataProfileTemplate {
	const wrap = (value: unknown, key: string) => value === undefined ? undefined : JSON.stringify({ [key]: value });
	return {
		name,
		settings: wrap(data.settings, 'settings'),
		keybindings: data.keybindings === undefined ? undefined : JSON.stringify({ platform, keybindings: data.keybindings }),
		tasks: wrap(data.tasks, 'tasks'),
		snippets: wrap(data.snippets, 'snippets'),
		extensions: data.extensions && JSON.stringify(data.extensions.map(id => ({ identifier: { id } }))),
	};
}
