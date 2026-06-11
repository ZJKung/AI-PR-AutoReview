import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import * as sinon from 'sinon';
import {
    loadRepoConfig,
    applyRepoConfig,
    matchGlob,
    filterPathsByGlobs,
    instructionsForFiles,
    RepoReviewConfig
} from '../src/services/repo-config.service';
import { PipelineInputs } from '../src/interfaces/pipeline-inputs.interface';

const tempDir = path.join(__dirname, 'temp-repo-config');
const configPath = path.join(tempDir, '.aireview.yml');

const baseInputs = { severityThreshold: 'warning', maxFindings: 20, systemInstruction: 'base' } as PipelineInputs;

describe('Repo Config (.aireview.yml)', () => {
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        sandbox.stub(console, 'log');
        sandbox.stub(console, 'warn');
        fs.mkdirSync(tempDir, { recursive: true });
    });

    afterEach(() => {
        sandbox.restore();
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('should load a valid config file', () => {
        fs.writeFileSync(configPath, [
            'severityThreshold: nit',
            'maxFindings: 5',
            'exclude:',
            '  - "**/*.generated.ts"',
            'instructions:',
            '  - glob: "src/api/**"',
            '    text: "Check authorization on every endpoint."'
        ].join('\n'));

        const config = loadRepoConfig(tempDir);
        expect(config).to.not.equal(null);
        expect(config!.severityThreshold).to.equal('nit');
        expect(config!.maxFindings).to.equal(5);
        expect(config!.exclude).to.deep.equal(['**/*.generated.ts']);
        expect(config!.instructions![0].glob).to.equal('src/api/**');
    });

    it('should return null when the file is missing', () => {
        expect(loadRepoConfig(tempDir)).to.equal(null);
    });

    it('should return null and warn on malformed YAML without throwing', () => {
        fs.writeFileSync(configPath, 'severityThreshold: [unclosed');
        expect(loadRepoConfig(tempDir)).to.equal(null);
    });

    it('should drop invalid field values but keep valid ones', () => {
        fs.writeFileSync(configPath, 'severityThreshold: blocker\nmaxFindings: 7');
        const config = loadRepoConfig(tempDir);
        expect(config!.severityThreshold).to.equal(undefined);
        expect(config!.maxFindings).to.equal(7);
    });

    it('should override task inputs only for fields the config sets', () => {
        const config: RepoReviewConfig = { severityThreshold: 'critical' };
        const merged = applyRepoConfig(baseInputs, config);
        expect(merged.severityThreshold).to.equal('critical');
        expect(merged.maxFindings).to.equal(20); // untouched
    });
});

describe('Glob Matching', () => {
    it('should match nested paths with **', () => {
        expect(matchGlob('src/api/**', 'src/api/users/handler.ts')).to.equal(true);
        expect(matchGlob('src/api/**', 'src/web/page.ts')).to.equal(false);
    });

    it('should keep * within a single path segment', () => {
        expect(matchGlob('*.md', 'README.md')).to.equal(true);
        expect(matchGlob('*.md', 'docs/guide.md')).to.equal(false);
        expect(matchGlob('**/*.md', 'docs/guide.md')).to.equal(true);
    });

    it('should ignore a leading slash on the path', () => {
        expect(matchGlob('src/**', '/src/a.ts')).to.equal(true);
    });

    it('should filter paths by include and exclude globs', () => {
        const paths = ['/src/a.ts', '/src/gen/b.generated.ts', '/docs/readme.md'];
        const result = filterPathsByGlobs(paths, undefined, ['**/*.generated.ts']);
        expect(result).to.deep.equal(['/src/a.ts', '/docs/readme.md']);

        const onlySrc = filterPathsByGlobs(paths, ['src/**'], undefined);
        expect(onlySrc).to.deep.equal(['/src/a.ts', '/src/gen/b.generated.ts']);
    });

    it('should collect instructions whose glob matches a changed file', () => {
        const config: RepoReviewConfig = {
            instructions: [
                { glob: 'src/api/**', text: 'Check authz.' },
                { glob: 'src/db/**', text: 'Check migrations.' }
            ]
        };

        const texts = instructionsForFiles(config, ['/src/api/users.ts', '/src/web/page.ts']);
        expect(texts).to.deep.equal(['Check authz.']);
    });
});
