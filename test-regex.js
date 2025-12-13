const line = "  price      decimal(10,2) [not null, check: price > 0]";
console.log('Original:', line);

let fixes = line;
// Logic from tryFixParseError
if (fixes.includes('check:')) {
    console.log('Detected check:');
    fixes = fixes.replace(/,\s*check\s*:\s*[^,\]]+/gi, '');
    fixes = fixes.replace(/check\s*:\s*[^,\]]+\s*,?/gi, '');
}

console.log('Fixed:', fixes);

if (fixes === line) {
    console.log('FAIL: No change');
} else {
    console.log('PASS: Changed');
}
