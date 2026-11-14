"""Serve the atlas with image MIME types on all Python installations."""

import mimetypes
import runpy

if __name__ == '__main__':
    mimetypes.add_type('image/webp', '.webp')
    mimetypes.add_type('image/avif', '.avif')
    runpy.run_module('http.server', run_name='__main__')
