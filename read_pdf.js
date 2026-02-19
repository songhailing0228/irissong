const fs = require('fs');
const { PDFParse } = require('pdf-parse');

const filePath = process.argv[2];

if (!filePath) {
    console.error('Usage: node read_pdf.js <path_to_pdf>');
    process.exit(1);
}

if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
}

const dataBuffer = fs.readFileSync(filePath);

async function main() {
    try {
        const parser = new PDFParse({ data: dataBuffer });
        const result = await parser.getText();
        console.log(result.text);
        await parser.destroy();
    } catch (error) {
        console.error('Error parsing PDF:', error);
        process.exit(1);
    }
}

main();
