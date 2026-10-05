const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { SignedXml } = require('xml-crypto');

const ROOT = __dirname;
const keyPath = path.join(ROOT, 'author.key');
const crtPath = path.join(ROOT, 'author.crt');

if (!fs.existsSync(keyPath) || !fs.existsSync(crtPath)) {
  console.error('author.key or author.crt not found!');
  process.exit(1);
}

const privateKey = fs.readFileSync(keyPath, 'utf8');
const certRaw = fs.readFileSync(crtPath, 'utf8');
const certBase64 = certRaw
  .replace(/-----BEGIN CERTIFICATE-----/g, '')
  .replace(/-----END CERTIFICATE-----/g, '')
  .replace(/[\r\n\s]/g, '');

// Lista de arquivos a incluir no pacote
function getFiles(dir, base = '') {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    if (file === 'node_modules' || file === '.git' || file === 'build-tizen' || file.endsWith('.wgt') || file.endsWith('.key') || file.endsWith('.crt') || file.endsWith('.ps1') || file.endsWith('.bat')) continue;
    const fullPath = path.join(dir, file);
    const relPath = base ? `${base}/${file}` : file;
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (file === 'css' || file === 'js') {
        results = results.concat(getFiles(fullPath, relPath));
      }
    } else {
      if (['config.xml', 'index.html', 'icon.png', 'logo.png'].includes(file) || base === 'css' || base === 'js') {
        results.push({ fullPath, relPath });
      }
    }
  }
  return results;
}

const files = getFiles(ROOT);
console.log(`Encontrados ${files.length} arquivos para empacotamento.`);

// Calcula SHA-256 de cada arquivo
const fileReferences = [];
for (const f of files) {
  const content = fs.readFileSync(f.fullPath);
  const hash = crypto.createHash('sha256').update(content).digest('base64');
  fileReferences.push({
    uri: f.relPath,
    digest: hash
  });
}

// Bloco de propriedades do autor
const propXml = `<Object Id="prop"><SignatureProperties xmlns:dsp="http://www.w3.org/2009/xmldsig-properties"><SignatureProperty Target="#AuthorSignature"><dsp:Profile URI="http://www.w3.org/ns/widgets-digsig#profile"/><dsp:Role URI="http://www.w3.org/ns/widgets-digsig#role-author"/><dsp:Identifier>VionPlayerAuthor</dsp:Identifier></SignatureProperty></SignatureProperties></Object>`;
const propHash = crypto.createHash('sha256').update(propXml, 'utf8').digest('base64');

// Monta SignedInfo
let refsXml = '';
for (const r of fileReferences) {
  refsXml += `<Reference URI="${r.uri}"><DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/><DigestValue>${r.digest}</DigestValue></Reference>`;
}
refsXml += `<Reference URI="#prop"><Transforms><Transform Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/></Transforms><DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/><DigestValue>${propHash}</DigestValue></Reference>`;

const signedInfoXml = `<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#"><CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/><SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>${refsXml}</SignedInfo>`;

// Assina o SignedInfo com RSA-SHA256
const signer = crypto.createSign('RSA-SHA256');
signer.update(signedInfoXml, 'utf8');
const signatureValue = signer.sign(privateKey, 'base64');

const authorSignatureXml = `<?xml version="1.0" encoding="UTF-8"?>
<Signature xmlns="http://www.w3.org/2000/09/xmldsig#" Id="AuthorSignature">
${signedInfoXml}
<SignatureValue>${signatureValue}</SignatureValue>
<KeyInfo>
<X509Data>
<X509Certificate>${certBase64}</X509Certificate>
</X509Data>
</KeyInfo>
${propXml}
</Signature>`;

fs.writeFileSync(path.join(ROOT, 'author-signature.xml'), authorSignatureXml, 'utf8');
console.log('✔ author-signature.xml gerado com sucesso!');
