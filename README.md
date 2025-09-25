# AmiiboTool

A comprehensive Node.js command-line tool for modifying Amiibo UIDs and generating fresh Amiibo files from scratch. This tool provides full control over Amiibo UID generation while maintaining compatibility with Nintendo Switch and other NFC-enabled devices.

## Features

- **UID Modification**: Change the UID of existing Amiibo files while preserving all other data
- **Fresh Generation**: Create brand new Amiibo files from scratch with proper initialization
- **Custom or Random UIDs**: Support for both user-specified UIDs and randomly generated ones
- **Switch Compatible**: Generated files work correctly on Nintendo Switch hardware
- **Proper Cryptography**: Uses correct BCC0, PWD, and PACK calculations for NFC compatibility
- **Automatic Validation**: Every generated file is automatically validated for correctness
- **Standalone Validation**: Validate any Amiibo files with comprehensive checks

## Prerequisites

- Node.js installed on your system
- `maboii` npm package (`npm install maboii`)
- Master key file (`key_retail.bin`) - required for Amiibo encryption/decryption

## Installation

1. Ensure you have Node.js installed
2. Install the maboii dependency:
   ```bash
   npm install maboii
   ```
3. Make the script executable:
   ```bash
   chmod +x amiibotool.js
   ```

## Usage

### Basic Syntax

```bash
node amiibotool.js <command> <key_file> [options]
```

### Commands

#### 1. Change UID (`change-uid`)

Modify the UID of an existing Amiibo file while preserving the original Amiibo ID and game data.

**Syntax:**
```bash
node amiibotool.js change-uid <key_file> <template.bin> <output.bin> [--uid <14_hex_chars>]
```

**Parameters:**
- `key_file`: Path to your master key file (usually `key_retail.bin`)
- `template.bin`: Input Amiibo file to modify
- `output.bin`: Output file path
- `--uid`: Optional custom UID (14 hex characters). If omitted, generates random UID

#### 2. Generate Fresh (`generate-fresh`)

Create a completely new Amiibo file from scratch with specified Amiibo ID.

**Syntax:**
```bash
node amiibotool.js generate-fresh <key_file> <amiibo_id_hex> <output.bin> [--uid <14_hex_chars>]
```

**Parameters:**
- `key_file`: Path to your master key file
- `amiibo_id_hex`: 16-character hex Amiibo ID (8 bytes)
- `output.bin`: Output file path
- `--uid`: Optional custom UID (14 hex characters). If omitted, generates random UID

#### 3. Validate (`validate`)

Validate one or more Amiibo files to ensure they are correctly formatted and cryptographically valid.

**Syntax:**
```bash
node amiibotool.js validate <key_file> <file1.bin> [file2.bin] [...]
```

**Parameters:**
- `key_file`: Path to your master key file
- `file1.bin`, `file2.bin`, etc.: One or more Amiibo files to validate

**Validation Checks:**
- **File Structure**: Confirms 540-byte file size and existence
- **HMAC Verification**: Validates cryptographic signature using master keys
- **Position 8 Check**: Verifies XOR calculation (UID[4] ^ UID[5] ^ UID[6] ^ UID[7])
- **PWD Validation**: Confirms correct password calculation with skip-BCC0 method
- **PACK Validation**: Ensures PACK bytes are set to 0x80 0x80

## Examples

### UID Modification Examples

```bash
# Change UID with random generation
node amiibotool.js change-uid key_retail.bin "original_mario.bin" "mario_new_uid.bin"

# Change UID with specific custom UID
node amiibotool.js change-uid key_retail.bin "original_link.bin" "link_custom.bin" --uid 0451186d0da09e

# Modify multiple files with different random UIDs
node amiibotool.js change-uid key_retail.bin "pikachu_original.bin" "pikachu_uid1.bin"
node amiibotool.js change-uid key_retail.bin "pikachu_original.bin" "pikachu_uid2.bin"
```

### Fresh Generation Examples

```bash
# Generate fresh Poochy with random UID
node amiibotool.js generate-fresh key_retail.bin 00800102035d0302 fresh_poochy.bin

# Generate fresh Pikachu with custom UID
node amiibotool.js generate-fresh key_retail.bin 1919000000090002 fresh_pikachu.bin --uid 0451186d0da09e

# Generate multiple fresh Amiibos
node amiibotool.js generate-fresh key_retail.bin 0000000000340102 fresh_mario.bin
node amiibotool.js generate-fresh key_retail.bin 0100000000040002 fresh_link.bin
```

### Validation Examples

```bash
# Validate a single file
node amiibotool.js validate key_retail.bin amiibo.bin

# Validate multiple specific files
node amiibotool.js validate key_retail.bin file1.bin file2.bin file3.bin

# Validate all .bin files in current directory
node amiibotool.js validate key_retail.bin *.bin

# Validate files in a specific directory
node amiibotool.js validate key_retail.bin /path/to/amiibos/*.bin
```

## Common Amiibo IDs

| Character | Amiibo ID | Series |
|-----------|-----------|--------|
| Poochy | `00800102035d0302` | Yoshi's Woolly World |
| Pikachu | `1919000000090002` | Super Smash Bros. |
| Mario | `0000000000340102` | Super Mario |
| Link | `0100000000040002` | The Legend of Zelda |
| Samus | `0200000000040002` | Metroid |
| Yoshi | `0300000000040002` | Super Mario |
| Donkey Kong | `0400000000040002` | Donkey Kong |
| Peach | `0500000000040002` | Super Mario |
| Zelda | `0600000000040002` | The Legend of Zelda |
| Sheik | `0700000000040002` | The Legend of Zelda |

> **Note**: You can find more Amiibo IDs in the [AmiiboAPI database](https://github.com/N3evin/AmiiboAPI/blob/master/database/amiibo.json).

## Technical Details

### UID Format

UIDs are 7-byte values with the following structure:
- **Byte 0**: Always `0x04` (NFC Type A prefix)
- **Bytes 1-6**: Random or custom values
- **BCC0**: Calculated as `UID[0] ^ UID[1] ^ UID[2] ^ 0x88`

When packed into the Amiibo file, the UID becomes 8 bytes: `[UID0, UID1, UID2, BCC0, UID3, UID4, UID5, UID6]`

### PWD Calculation

The tool uses the correct PWD calculation method that skips BCC0:
```javascript
PWD[0] = 0xAA ^ UID[1] ^ UID[3]
PWD[1] = 0x55 ^ UID[2] ^ UID[4]
PWD[2] = 0xAA ^ UID[3] ^ UID[5]
PWD[3] = 0x55 ^ UID[4] ^ UID[6]
```

### Key Features

- **Position 8 Calculation**: Automatically calculates as XOR of UID bytes 4-7 for Switch compatibility
- **Magic Bytes**: Includes proper initialization bytes for fresh Amiibo generation
- **PACK Values**: Sets correct PACK bytes (`0x80 0x80`) for NFC compatibility
- **HMAC Validation**: Properly encrypts/decrypts using master keys

## Output Information

The tool provides detailed output including:
- Original/Generated UID with BCC0
- Position 8 value (critical for Switch compatibility)
- Calculated PWD values
- Output file path
- Success confirmation

### Example Output

```
Loading template: original_mario.bin
Template unpacked successfully
Original Amiibo ID: 0000000000340102
New UID: 04 a3 7f 2c d1 85 b9
BCC0: 18
Packing data...
UID change completed!
Final UID: 04 a3 7f 18 2c d1 85 b9
Position 8: 4f
PWD: e1 52 39 6d
Output file: mario_new_uid.bin

📋 Validating generated file...

🔍 Validating: mario_new_uid.bin
✅ Valid HMAC - File unpacked successfully
🎯 Position 8: ✅ (4f)
🔐 PWD: ✅ (e1 52 39 6d)
📦 PACK: ✅ (80 80)
🏆 Overall: ✅ VALID
```

### Validation Output

The validation system provides detailed feedback with visual indicators:

- **🔍 File Check**: Shows which file is being validated
- **✅ HMAC Status**: Confirms cryptographic signature is valid
- **🎯 Position 8**: Verifies XOR calculation (critical for Switch compatibility)
- **🔐 PWD**: Confirms password calculation using skip-BCC0 method
- **📦 PACK**: Ensures PACK bytes are correctly set to 0x80 0x80
- **🏆 Overall**: Final validation result (✅ VALID or ❌ INVALID)

### Example Validation Output

```
🚀 Validating 3 file(s)...

🔍 Validating: pikachu_fresh.bin
✅ Valid HMAC - File unpacked successfully
🎯 Position 8: ✅ (e8)
🔐 PWD: ✅ (8c fa d6 c1)
📦 PACK: ✅ (80 80)
🏆 Overall: ✅ VALID

📊 VALIDATION SUMMARY
✅ Valid files: 3
❌ Invalid files: 0
📁 Total files: 3
```

## Error Handling

The tool includes comprehensive error checking:
- **Invalid UID Format**: UIDs must be exactly 14 hex characters
- **Invalid Amiibo ID**: Amiibo IDs must be exactly 16 hex characters
- **Missing Files**: Clear errors for missing template or key files
- **Encryption Errors**: Validation of master key loading and HMAC operations

## Troubleshooting

### Common Issues

1. **"Master keys not loaded"**
   - Ensure `key_retail.bin` exists and is valid
   - Check file permissions

2. **"Failed to unpack template file"**
   - Template file may be corrupted or invalid
   - Verify the file is a proper Amiibo dump

3. **"UID must be exactly 14 hex characters"**
   - Custom UIDs must be exactly 7 bytes (14 hex characters)
   - Example: `0451186d0da09e` (not `451186d0da09e`)

4. **Generated files don't work on Switch**
   - Ensure you're using valid Amiibo IDs from the official database
   - Check that the Position 8 calculation is correct in the output
   - Run validation to check for any issues: `node amiibotool.js validate key_retail.bin yourfile.bin`

5. **Validation failures**
   - ❌ Invalid HMAC: File may be corrupted or use wrong master keys
   - ❌ Position 8 error: UID calculation issue (should be UID[4] ^ UID[5] ^ UID[6] ^ UID[7])
   - ❌ PWD error: Password calculation incorrect (check skip-BCC0 method)
   - ❌ PACK error: Should be 0x80 0x80, indicates structural issue

## Compatibility

- **Tested on**: Nintendo Switch, New 3DS
- **Node.js**: Requires Node.js v14 or higher
- **File Format**: Generates standard 540-byte NTAG215 dumps
- **Encryption**: Uses proper Nintendo Amiibo cryptography

## Advanced Usage

### Batch Processing

Create a bash script to process multiple files:

```bash
#!/bin/bash
for file in *.bin; do
    echo "Processing $file..."
    node amiibotool.js change-uid key_retail.bin "$file" "modified_$file"
done
```

### Batch Validation

Validate multiple files at once:

```bash
# Validate all .bin files in current directory
node amiibotool.js validate key_retail.bin *.bin

# Validate files from different directories
node amiibotool.js validate key_retail.bin /path/to/amiibos/*.bin

# Use in scripts for automated testing
node amiibotool.js validate key_retail.bin output/*.bin && echo "All files valid!"
```

### Verification

Compare generated files with hex dump:
```bash
hexdump -C output.bin | head -20
```

## License

This tool is for educational and backup purposes only. Ensure you own the original Amiibo figures before creating dumps.
