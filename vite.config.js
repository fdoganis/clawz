import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import glsl from 'vite-plugin-glsl';
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig(({ mode }) => {

    //const THREE_CDN_PATH = 'https://cdn.jsdelivr.net/npm/three@0.179.0/build/three.module.js';
    const THREE_CDN_PATH = 'https://js13kgames.com/2025/webxr/three.module.js';
    const THREE_LOCAL_PATH = '/three.module.js';

    return {
        base: "/clawz",
        clearScreen: false,
        optimizeDeps: {
            esbuildOptions: {
                supported: {
                    'top-level-await': true
                }
            }
        },
        esbuild: {
            supported: {
                'top-level-await': true
            }
        }
        ,
        resolve: {
            alias: {
                'three': mode === 'production' ? 'three' : THREE_LOCAL_PATH
            }
        },
        /*
        build: {
            sourcemap: true,
            chunkSizeWarningLimit: 1024,
            minify: false,
            terserOptions: {
                compress: false,
                mangle: false
            }
        }
        ,*/
        build: {
            sourcemap: mode === 'production' ? false : true,
            chunkSizeWarningLimit: 1024,
            minify: mode === 'production' ? true : false,
            terserOptions: {
                compress: mode === 'production' ? true : false,
                mangle: mode === 'production' ? true : false
            },
            rollupOptions: {
                external: ['three'],
                output: {
                    paths: {
                        three: mode === 'production' ? THREE_CDN_PATH : 'three'
                    }
                }
            }
        }
        ,
        server: {
            open: true,
            allowedHosts: ['.trycloudflare.com']
        },
        plugins: [viteSingleFile()]
    };
});

