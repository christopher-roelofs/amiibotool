#!/usr/bin/env node
const fs = require('fs');
const crypto = require('crypto');
const maboii = require('maboii');

class AmiiboTool {
    constructor() {
        this.keys = null;
    }

    // Load master keys from file
    loadKeys(keyPath) {
        try {
            const keyBuffer = fs.readFileSync(keyPath);
            const keyArray = Array.from(keyBuffer);
            this.keys = maboii.loadMasterKeys(keyArray);
            if (!this.keys) {
                throw new Error('Failed to load master keys');
            }
            return true;
        } catch (error) {
            console.error('Error loading keys:', error.message);
            return false;
        }
    }

    // Parse .nfc file (Flipper Zero format) to binary
    parseNFCFile(filePath) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n');

            // Verify it's a Flipper NFC file
            if (!lines[0].includes('Flipper NFC device')) {
                throw new Error('Not a valid Flipper NFC file');
            }

            // Extract page data
            const pages = [];
            for (const line of lines) {
                if (line.startsWith('Page ')) {
                    // Parse "Page X: XX XX XX XX" format
                    const match = line.match(/Page \d+: ([0-9A-F]{2}) ([0-9A-F]{2}) ([0-9A-F]{2}) ([0-9A-F]{2})/i);
                    if (match) {
                        for (let i = 1; i <= 4; i++) {
                            pages.push(parseInt(match[i], 16));
                        }
                    }
                }
            }

            // NTAG215 should have 540 bytes (135 pages * 4 bytes)
            if (pages.length !== 540) {
                throw new Error(`Invalid NFC data size: ${pages.length} bytes (expected 540)`);
            }

            return new Uint8Array(pages);
        } catch (error) {
            throw new Error(`Failed to parse NFC file: ${error.message}`);
        }
    }

    // Read template file (supports both .bin and .nfc formats)
    readTemplateFile(filePath) {
        const ext = filePath.toLowerCase().split('.').pop();

        if (ext === 'nfc') {
            return this.parseNFCFile(filePath);
        } else {
            // Assume binary format
            return fs.readFileSync(filePath);
        }
    }

    // Generate random UID (7 bytes)
    generateRandomUID() {
        const uid = new Array(7);
        uid[0] = 0x04; // Standard NFC Type A UID prefix

        // Generate 6 random bytes
        const randomBytes = crypto.randomBytes(6);
        for (let i = 1; i < 7; i++) {
            uid[i] = randomBytes[i-1];
        }

        return uid;
    }

    // Parse custom UID from hex string
    parseCustomUID(uidHex) {
        if (uidHex.length !== 14) {
            throw new Error('UID must be exactly 14 hex characters (7 bytes)');
        }

        const uid = [];
        for (let i = 0; i < uidHex.length; i += 2) {
            uid.push(parseInt(uidHex.substr(i, 2), 16));
        }

        return uid;
    }

    // Calculate BCC0 for the UID
    calculateBCC0(uid) {
        return uid[0] ^ uid[1] ^ uid[2] ^ 0x88;
    }

    // Calculate PWD using the correct method (skip BCC0)
    calculatePWD(packedUID) {
        // Extract 7-byte UID skipping BCC0
        const uid7 = new Array(7);
        uid7[0] = packedUID[0];
        uid7[1] = packedUID[1];
        uid7[2] = packedUID[2];
        uid7[3] = packedUID[4]; // Skip BCC0 at position 3
        uid7[4] = packedUID[5];
        uid7[5] = packedUID[6];
        uid7[6] = packedUID[7];

        // Calculate PWD
        const pwd = [
            (0xAA ^ uid7[1] ^ uid7[3]) & 0xFF,
            (0x55 ^ uid7[2] ^ uid7[4]) & 0xFF,
            (0xAA ^ uid7[3] ^ uid7[5]) & 0xFF,
            (0x55 ^ uid7[4] ^ uid7[6]) & 0xFF
        ];

        return pwd;
    }

    // Validate a single bin file
    validateBin(filePath) {
        try {
            console.log(`\n🔍 Validating: ${filePath}`);

            // Check if file exists
            if (!fs.existsSync(filePath)) {
                console.log('❌ File does not exist');
                return false;
            }

            // Read file (supports both .bin and .nfc formats)
            const fileData = this.readTemplateFile(filePath);
            if (fileData.length !== 540) {
                console.log(`❌ Invalid file size: ${fileData.length} bytes (expected 540)`);
                return false;
            }

            const dataArray = Array.from(fileData);

            // Try to unpack the file
            const unpackResult = maboii.unpack(this.keys, dataArray);

            if (!unpackResult.result) {
                console.log('❌ Failed to unpack - Invalid HMAC or corrupted data');
                return false;
            }

            console.log('✅ Valid HMAC - File unpacked successfully');

            // Extract key information
            const uid = dataArray.slice(0, 8);
            const uidHex = uid.map(b => b.toString(16).padStart(2, '0')).join(' ');

            // Check position 8 calculation
            const pos8Expected = uid[4] ^ uid[5] ^ uid[6] ^ uid[7];
            const pos8Actual = uid[8] || dataArray[8];
            const pos8Valid = pos8Expected === pos8Actual;
            console.log(`🎯 Position 8: ${pos8Valid ? '✅' : '❌'} (${pos8Actual.toString(16).padStart(2, '0')})`);

            // Extract Amiibo ID
            const amiiboId = dataArray.slice(84, 92);
            const amiiboIdHex = amiiboId.map(b => b.toString(16).padStart(2, '0')).join('');

            // Extract PWD and PACK
            const pwd = dataArray.slice(532, 536);
            const pack = dataArray.slice(536, 538);

            // Validate PWD calculation
            const uid7 = [uid[0], uid[1], uid[2], uid[4], uid[5], uid[6], uid[7]];
            const expectedPwd = [
                (0xAA ^ uid7[1] ^ uid7[3]) & 0xFF,
                (0x55 ^ uid7[2] ^ uid7[4]) & 0xFF,
                (0xAA ^ uid7[3] ^ uid7[5]) & 0xFF,
                (0x55 ^ uid7[4] ^ uid7[6]) & 0xFF
            ];
            const pwdValid = pwd.every((byte, i) => byte === expectedPwd[i]);
            console.log(`🔐 PWD: ${pwdValid ? '✅' : '❌'} (${pwd.map(b => b.toString(16).padStart(2, '0')).join(' ')})`);

            // Validate PACK
            const packValid = pack[0] === 0x80 && pack[1] === 0x80;
            console.log(`📦 PACK: ${packValid ? '✅' : '❌'} (${pack.map(b => b.toString(16).padStart(2, '0')).join(' ')})`);

            const isValid = unpackResult.result && pos8Valid && pwdValid && packValid;
            console.log(`🏆 Overall: ${isValid ? '✅ VALID' : '❌ INVALID'}`);

            return {
                valid: isValid,
                uid: uidHex,
                amiiboId: amiiboIdHex,
                hmacValid: unpackResult.result,
                pos8Valid: pos8Valid,
                pwdValid: pwdValid,
                packValid: packValid
            };

        } catch (error) {
            console.log(`❌ Error validating file: ${error.message}`);
            return false;
        }
    }

    // Validate multiple files
    validateFiles(filePaths) {
        if (!this.keys) {
            throw new Error('Master keys not loaded. Call loadKeys() first.');
        }

        console.log(`🚀 Validating ${filePaths.length} file(s)...\n`);

        const results = [];
        for (const filePath of filePaths) {
            const result = this.validateBin(filePath);
            results.push({
                file: filePath,
                result: result
            });
        }

        // Summary
        const validFiles = results.filter(r => r.result && r.result.valid).length;
        const invalidFiles = results.length - validFiles;

        console.log(`\n📊 VALIDATION SUMMARY`);
        console.log(`✅ Valid files: ${validFiles}`);
        console.log(`❌ Invalid files: ${invalidFiles}`);
        console.log(`📁 Total files: ${results.length}`);

        return results;
    }

    // Change UID in existing amiibo file
    changeUID(templatePath, outputPath, customUID = null) {
        if (!this.keys) {
            throw new Error('Master keys not loaded. Call loadKeys() first.');
        }

        console.log('Loading template:', templatePath);

        // Read template (supports both .bin and .nfc formats)
        const templateData = Array.from(this.readTemplateFile(templatePath));
        const unpackResult = maboii.unpack(this.keys, templateData);

        if (!unpackResult.result) {
            throw new Error('Failed to unpack template file - invalid HMAC');
        }

        const unpackedData = unpackResult.unpacked;
        console.log('Template unpacked successfully');

        // Get original amiibo ID from unpacked data (positions 84-91 in packed become different in unpacked)
        // We'll read it from the original packed data
        const originalAmiiboID = templateData.slice(84, 92);
        console.log('Original Amiibo ID:', originalAmiiboID.map(b => b.toString(16).padStart(2, '0')).join(''));

        // Generate or use custom UID
        const newUID = customUID ? this.parseCustomUID(customUID) : this.generateRandomUID();
        const bcc0 = this.calculateBCC0(newUID);

        console.log('New UID:', newUID.map(b => b.toString(16).padStart(2, '0')).join(' '));
        console.log('BCC0:', bcc0.toString(16).padStart(2, '0'));

        // Set new UID in unpacked data
        unpackedData[468] = newUID[0];
        unpackedData[469] = newUID[1];
        unpackedData[470] = newUID[2];
        unpackedData[471] = bcc0;
        unpackedData[472] = newUID[3];
        unpackedData[473] = newUID[4];
        unpackedData[474] = newUID[5];
        unpackedData[475] = newUID[6];

        // Pack the data
        console.log('Packing data...');
        let packedData = maboii.pack(this.keys, unpackedData);

        // Fix position 8 (XOR of bytes 4-7)
        packedData[8] = packedData[4] ^ packedData[5] ^ packedData[6] ^ packedData[7];

        // Restore original amiibo ID in packed data
        for (let i = 0; i < 8; i++) {
            packedData[84 + i] = originalAmiiboID[i];
        }

        // Calculate and set PWD
        const pwd = this.calculatePWD(packedData);
        packedData[532] = pwd[0];
        packedData[533] = pwd[1];
        packedData[534] = pwd[2];
        packedData[535] = pwd[3];

        // Set PACK
        packedData[536] = 0x80;
        packedData[537] = 0x80;

        // Write to file
        fs.writeFileSync(outputPath, Buffer.from(packedData));

        console.log('UID change completed!');
        console.log('Final UID:', Array.from(packedData.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join(' '));
        console.log('Position 8:', packedData[8].toString(16).padStart(2, '0'));
        console.log('PWD:', pwd.map(b => b.toString(16).padStart(2, '0')).join(' '));
        console.log('Output file:', outputPath);

        // Automatically validate the generated file
        console.log('\n📋 Validating generated file...');
        const validationResult = this.validateBin(outputPath);
        if (!validationResult || !validationResult.valid) {
            console.log('⚠️  Warning: Generated file failed validation!');
        }

        return {
            uid: Array.from(packedData.slice(0, 8)),
            pwd: pwd,
            amiiboId: originalAmiiboID.map(b => b.toString(16).padStart(2, '0')).join(''),
            outputPath: outputPath
        };
    }

    // Generate fresh amiibo from scratch
    generateFresh(amiiboId, outputPath, customUID = null) {
        if (!this.keys) {
            throw new Error('Master keys not loaded. Call loadKeys() first.');
        }

        console.log('Creating fresh amiibo with ID:', amiiboId);

        // Create base unpacked data (540 bytes of zeros)
        const unpackedData = new Array(540).fill(0);

        // Generate or use custom UID
        const newUID = customUID ? this.parseCustomUID(customUID) : this.generateRandomUID();
        const bcc0 = this.calculateBCC0(newUID);

        console.log('Generated UID:', newUID.map(b => b.toString(16).padStart(2, '0')).join(' '));
        console.log('Calculated BCC0:', bcc0.toString(16).padStart(2, '0'));

        // Set UID in unpacked data (positions 468-475)
        unpackedData[468] = newUID[0];
        unpackedData[469] = newUID[1];
        unpackedData[470] = newUID[2];
        unpackedData[471] = bcc0;
        unpackedData[472] = newUID[3];
        unpackedData[473] = newUID[4];
        unpackedData[474] = newUID[5];
        unpackedData[475] = newUID[6];

        // Set the magic bytes from AmiiboConverter
        const magicBytes1 = [0x48, 0x0f, 0xe0, 0xf1, 0x10, 0xff, 0xee, 0xa5];
        for (let i = 0; i < magicBytes1.length; i++) {
            unpackedData[9 + i] = magicBytes1[i];
        }

        // Set more magic bytes at position 0x208 (520) in unpacked data
        const magicBytes2 = [0x01, 0x00, 0x0f, 0xbf, 0x00, 0x00, 0x00, 0x04,
                            0x5f, 0x00, 0x00, 0x00, 0x4e, 0xdb, 0xf1, 0x28,
                            0x80, 0x80, 0x00, 0x00];
        for (let i = 0; i < magicBytes2.length; i++) {
            unpackedData[520 + i] = magicBytes2[i];
        }

        // Set amiibo ID in UNPACKED data at position 476-483 BEFORE packing
        if (amiiboId.length !== 16) {
            throw new Error('Amiibo ID must be 16 hex characters (8 bytes)');
        }
        const idBytes = [];
        for (let i = 0; i < amiiboId.length; i += 2) {
            idBytes.push(parseInt(amiiboId.substr(i, 2), 16));
        }
        for (let i = 0; i < 8; i++) {
            unpackedData[476 + i] = idBytes[i];
        }
        console.log('Amiibo ID set in unpacked data at positions 476-483:', idBytes.map(b => b.toString(16).padStart(2, '0')).join(''));

        // Pack the data to get proper structure
        console.log('Packing amiibo data...');
        let packedData = maboii.pack(this.keys, unpackedData);

        // Set magic bytes in PACKED data (they get lost during packing)
        const packedMagicBytes = [0x48, 0x0f, 0xe0, 0xf1, 0x10, 0xff, 0xee, 0xa5];
        for (let i = 0; i < packedMagicBytes.length; i++) {
            packedData[9 + i] = packedMagicBytes[i];
        }
        console.log('Magic bytes set in packed data');

        // Calculate position 8 as XOR of UID bytes 4-7
        packedData[8] = packedData[4] ^ packedData[5] ^ packedData[6] ^ packedData[7];

        // Calculate PWD from the packed UID
        const pwd = this.calculatePWD(packedData);

        // Set PWD and PACK in packed data
        packedData[532] = pwd[0];
        packedData[533] = pwd[1];
        packedData[534] = pwd[2];
        packedData[535] = pwd[3];
        packedData[536] = 0x80; // PACK
        packedData[537] = 0x80; // PACK

        // Write to output file
        fs.writeFileSync(outputPath, Buffer.from(packedData));

        console.log('Fresh amiibo created successfully!');
        console.log('UID:', Array.from(packedData.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join(' '));
        console.log('Position 8:', packedData[8].toString(16).padStart(2, '0'));
        console.log('PWD:', pwd.map(b => b.toString(16).padStart(2, '0')).join(' '));
        console.log('Output file:', outputPath);

        // Automatically validate the generated file
        console.log('\n📋 Validating generated file...');
        const validationResult = this.validateBin(outputPath);
        if (!validationResult || !validationResult.valid) {
            console.log('⚠️  Warning: Generated file failed validation!');
        }

        return {
            uid: Array.from(packedData.slice(0, 8)),
            pwd: pwd,
            amiiboId: amiiboId,
            outputPath: outputPath
        };
    }
}

// CLI Usage
if (require.main === module) {
    const args = process.argv.slice(2);

    function showHelp() {
        console.log('AmiiboTool - Amiibo UID modifier and fresh generator');
        console.log('');
        console.log('Usage:');
        console.log('  node amiibotool.js <command> <key_file> [options]');
        console.log('');
        console.log('Commands:');
        console.log('  change-uid <template.bin> <output.bin> [--uid <14_hex_chars>]');
        console.log('    Change UID of existing amiibo file');
        console.log('    --uid: Custom UID (14 hex chars), if not provided uses random UID');
        console.log('');
        console.log('  generate-fresh <amiibo_id_hex> <output.bin> [--uid <14_hex_chars>]');
        console.log('    Generate fresh amiibo from scratch');
        console.log('    --uid: Custom UID (14 hex chars), if not provided uses random UID');
        console.log('');
        console.log('  validate <file1.bin> [file2.bin] [...]');
        console.log('    Validate one or more amiibo files');
        console.log('    Checks HMAC, UID calculations, PWD, and PACK values');
        console.log('');
        console.log('Examples:');
        console.log('  # Change UID with random UID (supports .bin and .nfc input)');
        console.log('  node amiibotool.js change-uid key_retail.bin template.bin output.bin');
        console.log('  node amiibotool.js change-uid key_retail.bin template.nfc output.bin');
        console.log('');
        console.log('  # Change UID with custom UID');
        console.log('  node amiibotool.js change-uid key_retail.bin template.bin output.bin --uid 0451186d0da09e');
        console.log('');
        console.log('  # Generate fresh amiibo with random UID');
        console.log('  node amiibotool.js generate-fresh key_retail.bin 00800102035d0302 fresh_poochy.bin');
        console.log('');
        console.log('  # Generate fresh amiibo with custom UID');
        console.log('  node amiibotool.js generate-fresh key_retail.bin 1919000000090002 fresh_pikachu.bin --uid 0451186d0da09e');
        console.log('');
        console.log('  # Validate amiibo files (supports .bin and .nfc)');
        console.log('  node amiibotool.js validate key_retail.bin file1.bin file2.nfc');
        console.log('  node amiibotool.js validate key_retail.bin *.bin *.nfc');
        console.log('');
        console.log('Common Amiibo IDs:');
        console.log('  Poochy: 00800102035d0302');
        console.log('  Pikachu: 1919000000090002');
        console.log('  Mario: 0000000000340102');
        console.log('  Link: 0100000000040002');
    }

    if (args.length < 3) {
        showHelp();
        process.exit(1);
    }

    const command = args[0];
    const keyFile = args[1];

    const tool = new AmiiboTool();

    // Load keys
    if (!tool.loadKeys(keyFile)) {
        process.exit(1);
    }

    try {
        if (command === 'change-uid') {
            if (args.length < 4) {
                console.error('Error: change-uid requires template and output file');
                showHelp();
                process.exit(1);
            }

            const templateFile = args[2];
            const outputFile = args[3];
            const uidIndex = args.indexOf('--uid');
            const customUID = uidIndex !== -1 && uidIndex + 1 < args.length ? args[uidIndex + 1] : null;

            tool.changeUID(templateFile, outputFile, customUID);

        } else if (command === 'generate-fresh') {
            if (args.length < 4) {
                console.error('Error: generate-fresh requires amiibo ID and output file');
                showHelp();
                process.exit(1);
            }

            const amiiboId = args[2];
            const outputFile = args[3];
            const uidIndex = args.indexOf('--uid');
            const customUID = uidIndex !== -1 && uidIndex + 1 < args.length ? args[uidIndex + 1] : null;

            tool.generateFresh(amiiboId, outputFile, customUID);

        } else if (command === 'validate') {
            if (args.length < 3) {
                console.error('Error: validate requires at least one bin file');
                showHelp();
                process.exit(1);
            }

            const binFiles = args.slice(2);
            tool.validateFiles(binFiles);

        } else {
            console.error('Error: Unknown command:', command);
            showHelp();
            process.exit(1);
        }

    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

module.exports = AmiiboTool;