import { YarnDependency } from './yarnStrategy';

const NPM_LOCATOR: RegExp = /^(@?[^@]+)@npm:([^@:]+)(?:::.*)?$/;
const PATCH_LOCATOR: RegExp = /^(@?[^@]+)@patch:@?[^@]+@npm%3A([^#]+)#/;
const VIRTUAL_PART: RegExp = /@virtual:[^#]*#/;

/**
 * Parse a Yarn Berry locator (as printed by 'yarn info' and 'yarn why') into a name and version.
 * Virtual and patch locators are mapped to the npm package they wrap.
 * @param locator - e.g. "@babel/core@npm:7.29.7"
 * @returns The npm dependency, or undefined for locators that are not npm packages (workspace, link, git, etc.)
 */
export function parseBerryLocator(locator: string): YarnDependency | undefined {
    const normalized: string = devirtualizeBerryLocator(locator);
    const match: RegExpMatchArray | null = normalized.match(NPM_LOCATOR) ?? normalized.match(PATCH_LOCATOR);
    if (!match) {
        return undefined;
    }
    return { name: match[1], version: match[2] };
}

export function devirtualizeBerryLocator(locator: string): string {
    return locator.replace(VIRTUAL_PART, '@');
}

export function getBerryLocatorName(locator: string): string {
    return locator.substring(0, locator.indexOf('@', 1));
}
