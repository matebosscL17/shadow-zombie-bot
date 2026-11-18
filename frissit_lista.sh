#!/bin/bash
# a patchnotes/lista.json frissítése (a bot ebből tudja, milyen Patch Notes-ok vannak)
cd "$(dirname "$0")"
python3 -c "import os,json; json.dump(sorted(f for f in os.listdir('patchnotes') if f.endswith('.md')), open('patchnotes/lista.json','w'), indent=1)"
