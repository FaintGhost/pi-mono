declare module "koffi" {
	interface KoffiLibrary {
		func(signature: string): (...args: unknown[]) => unknown;
	}

	interface KoffiModule {
		load(path: string): KoffiLibrary;
	}

	const koffi: KoffiModule;
	export default koffi;
}
