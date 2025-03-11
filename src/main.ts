import * as core from '@actions/core'
import { wait } from './wait'
import { execFile } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

function mkdir(dir: string): void {
  const exists = fs.existsSync(dir);
  core.debug("Creating directory: " + dir + " exists: " + exists);
  if (!exists) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function get_inputs(key: string, required: boolean = false): string[] {
  return core.getInput(key, {required: required}).split(/[\n\r,]+/).map((value: string) => value.trim()).filter((value: string) => value.length > 0)
}

function find_pkgs(dir: string): string[] {
  const pkgs: string[] = []
  for (const file of fs.readdirSync(dir)) {
    const full_path = path.join(dir, file)
    if (fs.lstatSync(full_path).isDirectory()) {
      pkgs.push(...find_pkgs(full_path))
    } else if (file.endsWith(".deb")) {
      pkgs.push(full_path)
    }
  }
  return pkgs
}

function apt_ftparchive_conf_tree(dist: string, archs: string[]): string {
  return `Tree "dists/${dist}" {
    Sections "main";
    Architectures "${archs.join(' ')}";
  }`
}

function apt_ftparchive_conf(dists: string[], archs: string[]): string {

  const trees = dists.map((dist: string) => apt_ftparchive_conf_tree(dist, archs)).join("\n")

  return `Dir {
	ArchiveDir "./deb";
	CacheDir "./cache";
};
Default {
	Packages::Compress ". gzip bzip2";
	Sources::Compress ". gzip bzip2";
	Contents::Compress ". gzip bzip2";
};
TreeDefault {
	Directory "pool/$(SECTION)";	
};
${trees}
`
}

function apt_release_conf(dist: string, component: string, archs: string[]): string {
  return `
APT::FTPArchive::Release::Origin "Github Actions";
APT::FTPArchive::Release::Label "Packages hosted by";
APT::FTPArchive::Release::Codename "${dist}";
APT::FTPArchive::Release::Components "${component}";
APT::FTPArchive::Release::Architectures "${archs.join(' ')}";
APT::FTPArchive::Release::Description "Packages hosted by";
`.trim()
}

function create_pool(pkgs_dir: string, repo_dir: string, dists: string[], components: string[], archs: string[]): void {
  for (const component of components) {
    const pool_dir = path.join(repo_dir, "pool", component)
    mkdir(pool_dir)
  }
  
  
  for (const dist of dists) {
    for (const arch of archs) {
      mkdir(path.join(repo_dir, "dists", dist, "main", `binary-${arch}`))
    }
  }
}

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    const build_dir: string = path.join(".", ".build")
    const repo_dir: string = path.join(build_dir, "deb")
    
    const dists: string[] = get_inputs('dists')
    const archs: string[] = get_inputs('archs')

    const pool_dir = path.join(repo_dir, "pool", "main")
    const cache_dir = path.join(build_dir, "cache")

    mkdir(build_dir)
    mkdir(cache_dir)
    mkdir(repo_dir)

    mkdir(pool_dir)
    for (const dist of dists) {
      for (const arch of archs) {
        mkdir(path.join(repo_dir, "dists", dist, "main", `binary-${arch}`))
      }
    }

    fs.writeFileSync(path.join(build_dir, "apt-ftparchive.conf"), apt_ftparchive_conf(dists, archs))

    const pkgs = find_pkgs("pkgs")
    for (const pkg of pkgs) {
      core.debug("Copying package: " + pkg)
      fs.copyFileSync(pkg, path.join(pool_dir, path.basename(pkg)))
    }
    
    /*
    execFile('apt-ftparchive', ['generate', "apt-ftparchive.conf"], {cwd: build_dir}, (error, stdout, stderr) => {
      if (error) {
        throw error;
      }
      core.debug(stdout);
      core.debug(stderr);
    });
    */

    const ms: string = core.getInput('milliseconds')
    const key_name: string = core.getInput('key_name', {required: true})


    // Debug logs are only output if the `ACTIONS_STEP_DEBUG` secret is true
    core.debug(`Waiting ${ms} milliseconds ${key_name} ...`)

    
    
    

    // Log the current timestamp, wait, then log the new timestamp
    core.debug(new Date().toTimeString())
    await wait(parseInt(ms, 10))
    core.debug(new Date().toTimeString())

    // Set outputs for other workflow steps to use
    core.setOutput('time', new Date().toTimeString())
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) core.setFailed(error.message)
  }
}
