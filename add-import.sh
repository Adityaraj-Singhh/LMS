#!/bin/bash

# Add ReadingMaterial import after line 7 (after StudentProgress require)
sed -i '7a const ReadingMaterial = require('\''../models/ReadingMaterial'\'');' controllers/studentController.js

echo "Added ReadingMaterial import successfully"