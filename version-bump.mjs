import { readFileSync, writeFileSync } from "fs";

const targetVersion = process.env.npm_package_version;
const semverPattern = /^\d+\.\d+\.\d+$/;

if (!semverPattern.test(targetVersion)) {
	throw new Error(`Invalid npm package version: ${targetVersion}`);
}

function compareSemver(a, b) {
	const [aMajor, aMinor, aPatch] = a.split(".").map(Number);
	const [bMajor, bMinor, bPatch] = b.split(".").map(Number);

	return aMajor - bMajor || aMinor - bMinor || aPatch - bPatch;
}

// read minAppVersion from manifest.json and bump version to target version
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeFileSync("manifest.json", JSON.stringify(manifest, null, "\t"));

// Obsidian only needs versions.json entries when minAppVersion changes.
const versions = JSON.parse(readFileSync("versions.json", "utf8"));
const latestVersion = Object.keys(versions)
	.filter((version) => semverPattern.test(version))
	.sort(compareSemver)
	.at(-1);

if (
	semverPattern.test(targetVersion) &&
	!(targetVersion in versions) &&
	(!latestVersion || versions[latestVersion] !== minAppVersion)
) {
	versions[targetVersion] = minAppVersion;
	writeFileSync("versions.json", JSON.stringify(versions, null, "\t"));
}
