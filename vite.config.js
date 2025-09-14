import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import glsl from 'vite-plugin-glsl';
import { viteSingleFile } from "vite-plugin-singlefile"

export default defineConfig({
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
        sourcemap: false,
        chunkSizeWarningLimit: 1024,
        minify: true,
        terserOptions: {
            compress: true,
            mangle: true
        },
        rollupOptions: {
            external: ['three'],
            output: {
                paths: {
                    three: 'https://js13kgames.com/2025/webxr/three.module.js'
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
})

