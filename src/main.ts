import { App, Menu, Notice, Plugin, PluginManifest, TextFileView, TFile, WorkspaceLeaf } from 'obsidian';

const VIEW_TYPE = 'mermaid-tools-view';

declare global {
	interface Window {
		mermaid?: {
			init?: (config: undefined, el: Element) => void | Promise<void>;
		};
	}
}

function isMermaidSvg(el: Element): el is SVGSVGElement {
	try {
		if (!(el instanceof SVGSVGElement)) return false;
		// Mermaid renders the diagram root as a direct child of its .mermaid host.
		// Checking any ancestor would also classify SVG icons inside the diagram.
		if (el.parentElement?.classList.contains('mermaid')) return true;
	} catch (_) {}
	return false;
}

function ensureNamespacesOnSvg(svg: SVGSVGElement): void {
	if (!svg.getAttribute('xmlns')) svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
	if (!svg.getAttribute('xmlns:xlink')) svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
}

function serializeSvg(svg: SVGSVGElement): string {
	const clone = svg.cloneNode(true) as SVGSVGElement;
	ensureNamespacesOnSvg(clone);
	clone.style.transform = '';
	const vb = clone.viewBox?.baseVal;
	if (vb && vb.width && vb.height) {
		if (!clone.getAttribute('width')) clone.setAttribute('width', String(vb.width));
		if (!clone.getAttribute('height')) clone.setAttribute('height', String(vb.height));
	}
	const s = new XMLSerializer().serializeToString(clone);
	return `<?xml version="1.0" encoding="UTF-8"?>\n${s}`;
}

async function svgToPngArrayBuffer(svg: SVGSVGElement): Promise<ArrayBuffer> {
	const maxSide = 8192;
	const maxPixels = 16_000_000;
	const svgString = serializeSvg(svg);
	const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
	const url = URL.createObjectURL(blob);
	try {
		const img = new Image();
		img.crossOrigin = 'anonymous';
		await new Promise<void>((resolve, reject) => {
			img.onload = () => resolve();
			img.onerror = reject;
			img.src = url;
		});
		const vb = svg.viewBox?.baseVal;
		const width =
			vb && vb.width
				? vb.width
				: parseFloat(svg.getAttribute('width') ?? '') || svg.getBBox().width || 800;
		const height =
			vb && vb.height
				? vb.height
				: parseFloat(svg.getAttribute('height') ?? '') || svg.getBBox().height || 600;
		if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
			throw new Error('Diagram dimensions are invalid');
		}
		const scale = Math.min(1, maxSide / width, maxSide / height, Math.sqrt(maxPixels / (width * height)));
		const canvas = document.createElement('canvas');
		canvas.width = Math.max(1, Math.floor(width * scale));
		canvas.height = Math.max(1, Math.floor(height * scale));
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('Could not get canvas 2d context');
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
		const pngBlob = await new Promise<Blob>((resolve, reject) =>
			canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))), 'image/png')
		);
		return await pngBlob.arrayBuffer();
	} finally {
		URL.revokeObjectURL(url);
	}
}

async function ensureFolderExists(app: App, folderPath: string): Promise<void> {
	if (!folderPath) return;
	if (await app.vault.adapter.exists(folderPath)) return;
	try {
		await app.vault.createFolder(folderPath);
	} catch (error) {
		// Another export may have created this folder between the existence check and create.
		if (!(await app.vault.adapter.exists(folderPath))) throw error;
	}
}

function pathParts(path: string): { folder: string; name: string } {
	const idx = path.lastIndexOf('/');
	if (idx === -1) return { folder: '', name: path };
	return { folder: path.substring(0, idx), name: path.substring(idx + 1) };
}

function basenameNoExt(name: string): string {
	const i = name.lastIndexOf('.');
	return i === -1 ? name : name.substring(0, i);
}

async function createUniqueExport(
	app: App,
	folder: string,
	base: string,
	ext: string,
	content: string | ArrayBuffer
): Promise<string> {
	let n = 1;
	while (true) {
		const candidate = (folder ? folder + '/' : '') + `${base}${n > 1 ? '-' + n : ''}.${ext}`;
		if (await app.vault.adapter.exists(candidate)) {
			n++;
			continue;
		}
		try {
			if (typeof content === 'string') await app.vault.create(candidate, content);
			else await app.vault.createBinary(candidate, content);
			return candidate;
		} catch (error) {
			// Retry only when a competing export created this exact path.
			if (!(await app.vault.adapter.exists(candidate))) throw error;
			n++;
		}
	}
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

class MermaidFileView extends TextFileView {
	private readonly plugin: MermaidToolsPlugin;

	constructor(leaf: WorkspaceLeaf, plugin: MermaidToolsPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.contentEl.addClass('mt-mermaid-file');
	}

	getViewType(): string {
		return VIEW_TYPE;
	}

	getDisplayText(): string {
		return this.file ? `${this.file.basename} (Mermaid)` : 'Mermaid Diagram';
	}

	getViewData(): string {
		return this.data;
	}

	async onLoadFile(file: TFile): Promise<void> {
		await super.onLoadFile(file);
	}

	async onUnloadFile(file: TFile): Promise<void> {
		await super.onUnloadFile(file);
	}

	clear(): void {
		this.contentEl.empty();
	}

	setViewData(data: string, clear: boolean): void {
		if (clear) this.clear();
		this.clear();
		const container = this.contentEl.createDiv({ cls: 'mermaid' });
		container.textContent = data || '';
		this.plugin.trackSourcePath(this.contentEl, this.file?.path ?? '');
		void this.renderDiagram();
	}

	private async renderDiagram(): Promise<void> {
		try {
			const mermaid = window.mermaid;
			if (!mermaid?.init) {
				new Notice('Mermaid plugin not available. Enable the core Mermaid plugin.');
				return;
			}
			await mermaid.init(undefined, this.contentEl);
			this.contentEl.querySelectorAll('svg').forEach((svg) => {
				if (isMermaidSvg(svg)) this.plugin.enhanceMermaidSvg(svg, this.file?.path ?? '');
			});
		} catch (e) {
			console.error('Mermaid Tools render error:', e);
			new Notice('Failed to render Mermaid diagram.');
		}
	}
}

export default class MermaidToolsPlugin extends Plugin {
	private diagramCounter: Map<string, number> = new Map();
	private sourcePaths = new WeakMap<Element, string>();

	constructor(app: App, manifest: PluginManifest) {
		super(app, manifest);
	}

	async onload(): Promise<void> {
		this.diagramCounter = new Map();
		this.sourcePaths = new WeakMap<Element, string>();

		this.registerMarkdownPostProcessor((el, ctx) => {
			this.trackSourcePath(el, ctx.sourcePath);
			window.requestAnimationFrame(() => {
				el.querySelectorAll('svg').forEach((svg) => {
					if (!isMermaidSvg(svg)) return;
					if (svg.dataset['mtProcessed']) return;
					this.enhanceMermaidSvg(svg, ctx?.sourcePath ?? '');
				});
			});
		});

		const obs = new MutationObserver((mutations) => {
			for (const m of mutations) {
				m.addedNodes.forEach((node) => {
					if (!(node instanceof Element)) return;
					const svgs: SVGSVGElement[] = [
						...(node.matches('svg') ? [node as SVGSVGElement] : []),
						...Array.from(node.querySelectorAll<SVGSVGElement>('svg')),
					];
					svgs.forEach((svg) => {
						if (!isMermaidSvg(svg)) return;
						if (svg.dataset['mtProcessed']) return;
						const sourcePath = this.sourcePathFor(svg);
						if (sourcePath !== undefined) this.enhanceMermaidSvg(svg, sourcePath);
					});
				});
			}
		});
		this.register(() => obs.disconnect());
		obs.observe(document.body, { childList: true, subtree: true });

		this.registerView(VIEW_TYPE, (leaf) => new MermaidFileView(leaf, this));
		this.registerExtensions(['mermaid', 'mmd'], VIEW_TYPE);
	}

	trackSourcePath(el: Element, sourcePath: string): void {
		this.sourcePaths.set(el, sourcePath);
	}

	private sourcePathFor(el: Element): string | undefined {
		let current: Element | null = el;
		while (current) {
			const sourcePath = this.sourcePaths.get(current);
			if (sourcePath !== undefined) return sourcePath;
			current = current.parentElement;
		}
		return undefined;
	}

	onunload(): void {}

	private nextDiagramIndex(sourcePath: string): number {
		const key = sourcePath || '__global__';
		const cur = this.diagramCounter.get(key) ?? 0;
		const next = cur + 1;
		this.diagramCounter.set(key, next);
		return next;
	}

	enhanceMermaidSvg(svg: SVGSVGElement, sourcePath: string): void {
		try {
			if (!(svg instanceof SVGSVGElement)) return;
			svg.dataset['mtProcessed'] = '1';

			const wrap = document.createElement('div');
			wrap.className = 'mt-mermaid-wrap';
			const originalParent = svg.parentElement;
			if (!originalParent) {
				delete svg.dataset['mtProcessed'];
				return;
			}
			originalParent.insertBefore(wrap, svg);
			wrap.appendChild(svg);

			svg.classList.add('mt-mermaid-svg');

			wrap.tabIndex = 0;
			wrap.setAttribute('role', 'button');
			wrap.setAttribute('aria-label', 'Zoom Mermaid diagram');
			wrap.setAttribute('aria-pressed', 'false');
			let hovered = false;
			let toggledZoom = false;
			const updateZoom = () => {
				const zoomed = hovered || toggledZoom;
				wrap.classList.toggle('mt-hover', zoomed);
				wrap.setAttribute('aria-pressed', String(zoomed));
			};
			const onEnter = () => {
				hovered = true;
				updateZoom();
			};
			const onLeave = () => {
				hovered = false;
				updateZoom();
			};
			const onClick = (evt: MouseEvent) => {
				if (!window.matchMedia('(hover: none) and (pointer: coarse)').matches) return;
				if (!(evt.target instanceof Element) || evt.target.closest('a')) return;
				toggledZoom = !toggledZoom;
				updateZoom();
			};
			const onKeyDown = (evt: KeyboardEvent) => {
				if (evt.key === 'Enter' && !evt.repeat) {
					evt.preventDefault();
					toggledZoom = !toggledZoom;
					updateZoom();
				} else if (evt.key === ' ') {
					evt.preventDefault();
				} else if (evt.key === 'Escape') {
					toggledZoom = false;
					updateZoom();
				}
			};
			const onKeyUp = (evt: KeyboardEvent) => {
				if (evt.key !== ' ') return;
				evt.preventDefault();
				toggledZoom = !toggledZoom;
				updateZoom();
			};
			wrap.addEventListener('mouseenter', onEnter);
			wrap.addEventListener('mouseleave', onLeave);
			wrap.addEventListener('click', onClick);
			wrap.addEventListener('keydown', onKeyDown);
			wrap.addEventListener('keyup', onKeyUp);
			this.register(() => {
				wrap.removeEventListener('mouseenter', onEnter);
				wrap.removeEventListener('mouseleave', onLeave);
				wrap.removeEventListener('click', onClick);
				wrap.removeEventListener('keydown', onKeyDown);
				wrap.removeEventListener('keyup', onKeyUp);
				if (wrap.parentElement) wrap.replaceWith(svg);
				svg.classList.remove('mt-mermaid-svg');
				delete svg.dataset['mtProcessed'];
			});

			const index = this.nextDiagramIndex(sourcePath);
			const contextHandler = (evt: MouseEvent) => {
				if (!(evt.target instanceof Element)) return;
				if (!wrap.contains(evt.target)) return;
				const menu = new Menu();
				menu.addItem((item) =>
					item
						.setTitle('Export as SVG')
						.setIcon('image-file')
						.onClick(async () => {
							try {
								const { folder, name } = pathParts(sourcePath || 'Mermaid Exports/diagram');
								const base = basenameNoExt(name || 'diagram') + `-diagram-${index}`;
								const outFolder = folder || 'Mermaid Exports';
								await ensureFolderExists(this.app, outFolder);
								const target = await createUniqueExport(this.app, outFolder, base, 'svg', serializeSvg(svg));
								new Notice(`Saved SVG: ${target}`);
							} catch (e) {
								console.error(e);
								new Notice(`Failed to export SVG: ${errorMessage(e)}`);
							}
						})
				);
				menu.addItem((item) =>
					item
						.setTitle('Export as PNG (white background)')
						.setIcon('image-file')
						.onClick(async () => {
							try {
								const { folder, name } = pathParts(sourcePath || 'Mermaid Exports/diagram');
								const base = basenameNoExt(name || 'diagram') + `-diagram-${index}`;
								const outFolder = folder || 'Mermaid Exports';
								await ensureFolderExists(this.app, outFolder);
								const arrayBuffer = await svgToPngArrayBuffer(svg);
								const target = await createUniqueExport(this.app, outFolder, base, 'png', arrayBuffer);
								new Notice(`Saved PNG (white background, size limited if needed): ${target}`);
							} catch (e) {
								console.error(e);
								new Notice(`Failed to export PNG: ${errorMessage(e)}`);
							}
						})
				);
				menu.showAtMouseEvent(evt);
				evt.preventDefault();
				evt.stopPropagation();
			};
			wrap.addEventListener('contextmenu', contextHandler);
			this.register(() => wrap.removeEventListener('contextmenu', contextHandler));
		} catch (e) {
			console.error('Mermaid Tools enhance error:', e);
		}
	}
}
