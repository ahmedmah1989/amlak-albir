import 'server-only';
/**
 * الفاتورة الإلكترونية — المرحلة الثانية (الربط والتكامل مع منصة «فاتورة» لهيئة الزكاة والضريبة والجمارك):
 * 1) مفتاح ECDSA (secp256k1) وطلب شهادة CSR بالحقول المطلوبة.
 * 2) شهادة الامتثال (CCSID) برمز OTP من بوابة فاتورة، ثم فحوص الامتثال، ثم شهادة الإنتاج (PCSID).
 * 3) لكل فاتورة: XML بصيغة UBL 2.1، تجزئة SHA-256، توقيع XAdES، ورمز QR بتسعة حقول.
 * 4) الإرسال: «إبلاغ» للفواتير المبسطة (للأفراد)، و«اعتماد» للفواتير الضريبية القياسية (لمنشأة لها رقم ضريبي).
 */
import { createHash, createSign, generateKeyPairSync, createPrivateKey, createPublicKey, X509Certificate } from 'crypto';

export const ZATCA_ENVS: Record<string, { label: string; url: string; template: string }> = {
  sandbox: { label: 'بيئة المطورين (تجربة بدون أثر)', url: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal', template: 'TSTZATCA-Code-Signing' },
  simulation: { label: 'بيئة المحاكاة (تجربة ببيانات الجمعية)', url: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation', template: 'PREZATCA-Code-Signing' },
  production: { label: 'بيئة الإنتاج (فعلي)', url: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/core', template: 'ZATCA-Code-Signing' },
};
export const baseUrl = (env: string) => process.env.ZATCA_BASE_URL || ZATCA_ENVS[env]?.url || ZATCA_ENVS.sandbox.url;

// ---------------- DER (ASN.1) مختصر لبناء طلب الشهادة ----------------
const len = (n: number) => n < 128 ? Buffer.from([n]) : n < 256 ? Buffer.from([0x81, n]) : Buffer.from([0x82, n >> 8, n & 255]);
const tlv = (tag: number, body: Buffer) => Buffer.concat([Buffer.from([tag]), len(body.length), body]);
const seq = (...x: Buffer[]) => tlv(0x30, Buffer.concat(x));
const set = (...x: Buffer[]) => tlv(0x31, Buffer.concat(x));
const int = (n: number) => tlv(0x02, Buffer.from([n]));
const utf8 = (s: string) => tlv(0x0c, Buffer.from(s, 'utf8'));
const printable = (s: string) => tlv(0x13, Buffer.from(s, 'ascii'));
const octet = (b: Buffer) => tlv(0x04, b);
function oid(s: string) {
  const p = s.split('.').map(Number); const out = [p[0] * 40 + p[1]];
  for (const v of p.slice(2)) { const st: number[] = []; let x = v; st.unshift(x & 127); x >>= 7; while (x) { st.unshift((x & 127) | 128); x >>= 7; } out.push(...st); }
  return tlv(0x06, Buffer.from(out));
}
const atv = (o: string, v: Buffer) => set(seq(oid(o), v));
const ctx = (n: number, b: Buffer, constructed = true) => tlv((constructed ? 0xa0 : 0x80) | n, b);

export type EgsInfo = { cn: string; serial: string; vat: string; org: string; branch: string; address: string; category: string; invoiceTypes?: string; env: string };
export function generateKeys() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'secp256k1' });
  return { privatePem: privateKey.export({ type: 'sec1', format: 'pem' }) as string, publicDer: publicKey.export({ type: 'spki', format: 'der' }) as Buffer };
}
/** طلب شهادة بصيغة PKCS#10 بالحقول التي تطلبها الهيئة، موقّع بالمفتاح الخاص — يُعاد base64 لنص PEM كما تطلبه واجهة فاتورة */
export function buildCsr(privatePem: string, e: EgsInfo) {
  const key = createPrivateKey(privatePem), spki = createPublicKey(key).export({ type: 'spki', format: 'der' }) as Buffer;
  const subject = seq(atv('2.5.4.6', printable('SA')), atv('2.5.4.11', utf8(e.branch)), atv('2.5.4.10', utf8(e.org)), atv('2.5.4.3', utf8(e.cn)));
  const dirName = seq(atv('2.5.4.4', utf8(e.serial)), atv('0.9.2342.19200300.100.1.1', utf8(e.vat)), atv('2.5.4.12', utf8(e.invoiceTypes ?? '1100')), atv('2.5.4.26', utf8(e.address)), atv('2.5.4.15', utf8(e.category)));
  const san = seq(ctx(4, dirName));
  const exts = seq(
    seq(oid('1.3.6.1.4.1.311.20.2'), octet(printable(ZATCA_ENVS[e.env]?.template ?? 'TSTZATCA-Code-Signing'))),
    seq(oid('2.5.29.17'), octet(san)));
  const attrs = ctx(0, seq(oid('1.2.840.113549.1.9.14'), set(exts)));
  const info = seq(int(0), subject, spki, attrs);
  const sig = createSign('sha256').update(info).sign(key);
  const der = seq(info, seq(oid('1.2.840.10045.4.3.2')), tlv(0x03, Buffer.concat([Buffer.from([0]), sig])));
  const pem = `-----BEGIN CERTIFICATE REQUEST-----\n${der.toString('base64').replace(/(.{64})/g, '$1\n').trim()}\n-----END CERTIFICATE REQUEST-----\n`;
  return Buffer.from(pem).toString('base64');
}

// ---------------- واجهة فاتورة ----------------
export async function zatcaApi(env: string, path: string, o: { otp?: string; auth?: [string, string]; body: unknown; clearance?: boolean }) {
  const h: Record<string, string> = { 'Accept-Version': 'V2', 'Content-Type': 'application/json', Accept: 'application/json', 'Accept-Language': 'en' };
  if (o.otp) h.OTP = o.otp;
  if (o.auth) h.Authorization = 'Basic ' + Buffer.from(`${o.auth[0]}:${o.auth[1]}`).toString('base64');
  if (o.clearance !== undefined) h['Clearance-Status'] = o.clearance ? '1' : '0';
  const r = await fetch(baseUrl(env) + path, { method: 'POST', headers: h, body: JSON.stringify(o.body), signal: AbortSignal.timeout(30000) });
  const text = await r.text(); let j: any = {}; try { j = JSON.parse(text); } catch { j = { raw: text.slice(0, 500) }; }
  return { status: r.status, ok: r.status >= 200 && r.status < 300, json: j };
}
export const certFromToken = (token: string) => Buffer.from(token, 'base64').toString('utf8'); // الشهادة base64 (DER) داخل التوكن

// ---------------- XML (UBL 2.1) ----------------
const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r/g, '&#xD;');
const el = (name: string, content: string, attrs: Record<string, string> = {}) => `<${name}${Object.keys(attrs).sort().map((k) => ` ${k}="${esc(attrs[k]).replace(/"/g, '&quot;')}"`).join('')}>${content}</${name}>`;
const t = (name: string, v: string | number, attrs: Record<string, string> = {}) => el(name, esc(String(v)), attrs);
const amt = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
export type Party = { name: string; vat?: string | null; crn?: string | null; street?: string; building?: string; district?: string; city?: string; postal?: string };
export type InvInput = { uuid: string; no: string; icv: number; pih: string; issueDate: string; issueTime: string; kind: 'invoice' | 'credit'; standard: boolean;
  seller: Party; buyer: Party; supplyDate: string | null; description: string; net: number; vat: number; total: number; vatRate: number; refNo?: string | null; reason?: string | null; paymentCode?: string };
const ROOT_NS = { xmlns: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2', 'xmlns:cac': 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2', 'xmlns:cbc': 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2', 'xmlns:ext': 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2' };
const nsAttrs = () => Object.entries(ROOT_NS).map(([k, v]) => ` ${k}="${v}"`).join(''); // c14n: الافتراضي أولاً ثم البادئات بالترتيب الأبجدي
function party(tag: string, p: Party, seller: boolean) {
  const addr = el('cac:PostalAddress', [p.street && t('cbc:StreetName', p.street), p.building && t('cbc:BuildingNumber', p.building), p.district && t('cbc:CitySubdivisionName', p.district), p.city && t('cbc:CityName', p.city), p.postal && t('cbc:PostalZone', p.postal), el('cac:Country', t('cbc:IdentificationCode', 'SA'))].filter(Boolean).join(''));
  const id = seller && p.crn ? el('cac:PartyIdentification', t('cbc:ID', p.crn, { schemeID: 'CRN' })) : '';
  const tax = p.vat ? el('cac:PartyTaxScheme', t('cbc:CompanyID', p.vat) + el('cac:TaxScheme', t('cbc:ID', 'VAT'))) : el('cac:PartyTaxScheme', el('cac:TaxScheme', t('cbc:ID', 'VAT')));
  return el(tag, el('cac:Party', id + addr + tax + el('cac:PartyLegalEntity', t('cbc:RegistrationName', p.name))));
}
/** يبني الفاتورة «النقية» (بدون التوقيع وQR) — بالشكل القانوني (c14n) مباشرة: بلا فراغات ولا وسوم مختصرة */
export function pureXml(i: InvInput) {
  const cat = i.vatRate > 0 ? 'S' : 'E', code = i.kind === 'credit' ? '381' : '388', sub = (i.standard ? '01' : '02') + '00000';
  const exReason = cat === 'E' ? t('cbc:TaxExemptionReasonCode', 'VATEX-SA-30') + t('cbc:TaxExemptionReason', 'Real estate transactions') : '';
  const taxCat = el('cac:TaxCategory', t('cbc:ID', cat, { schemeAgencyID: '6', schemeID: 'UN/ECE 5305' }) + t('cbc:Percent', amt(i.vatRate)) + exReason + el('cac:TaxScheme', t('cbc:ID', 'VAT', { schemeAgencyID: '6', schemeID: 'UN/ECE 5153' })));
  return `<Invoice${nsAttrs()}>` +
    t('cbc:ProfileID', 'reporting:1.0') + t('cbc:ID', i.no) + t('cbc:UUID', i.uuid) + t('cbc:IssueDate', i.issueDate) + t('cbc:IssueTime', i.issueTime) +
    t('cbc:InvoiceTypeCode', code, { name: sub }) + t('cbc:DocumentCurrencyCode', 'SAR') + t('cbc:TaxCurrencyCode', 'SAR') +
    (i.kind === 'credit' && i.refNo ? el('cac:BillingReference', el('cac:InvoiceDocumentReference', t('cbc:ID', i.refNo))) : '') +
    el('cac:AdditionalDocumentReference', t('cbc:ID', 'ICV') + t('cbc:UUID', String(i.icv))) +
    el('cac:AdditionalDocumentReference', t('cbc:ID', 'PIH') + el('cac:Attachment', t('cbc:EmbeddedDocumentBinaryObject', i.pih, { mimeCode: 'text/plain' }))) +
    party('cac:AccountingSupplierParty', i.seller, true) + party('cac:AccountingCustomerParty', i.buyer, false) +
    (i.supplyDate ? el('cac:Delivery', t('cbc:ActualDeliveryDate', i.supplyDate)) : '') +
    el('cac:PaymentMeans', t('cbc:PaymentMeansCode', i.paymentCode ?? '42') + (i.kind === 'credit' ? t('cbc:InstructionNote', i.reason || 'Credit note') : '')) +
    el('cac:TaxTotal', t('cbc:TaxAmount', amt(i.vat), { currencyID: 'SAR' })) +
    el('cac:TaxTotal', t('cbc:TaxAmount', amt(i.vat), { currencyID: 'SAR' }) + el('cac:TaxSubtotal', t('cbc:TaxableAmount', amt(i.net), { currencyID: 'SAR' }) + t('cbc:TaxAmount', amt(i.vat), { currencyID: 'SAR' }) + taxCat)) +
    el('cac:LegalMonetaryTotal', t('cbc:LineExtensionAmount', amt(i.net), { currencyID: 'SAR' }) + t('cbc:TaxExclusiveAmount', amt(i.net), { currencyID: 'SAR' }) + t('cbc:TaxInclusiveAmount', amt(i.total), { currencyID: 'SAR' }) + t('cbc:AllowanceTotalAmount', '0.00', { currencyID: 'SAR' }) + t('cbc:PrepaidAmount', '0.00', { currencyID: 'SAR' }) + t('cbc:PayableAmount', amt(i.total), { currencyID: 'SAR' })) +
    el('cac:InvoiceLine', t('cbc:ID', '1') + t('cbc:InvoicedQuantity', '1.000000', { unitCode: 'PCE' }) + t('cbc:LineExtensionAmount', amt(i.net), { currencyID: 'SAR' }) +
      el('cac:TaxTotal', t('cbc:TaxAmount', amt(i.vat), { currencyID: 'SAR' }) + t('cbc:RoundingAmount', amt(i.total), { currencyID: 'SAR' })) +
      el('cac:Item', t('cbc:Name', i.description) + el('cac:ClassifiedTaxCategory', t('cbc:ID', cat) + t('cbc:Percent', amt(i.vatRate)) + el('cac:TaxScheme', t('cbc:ID', 'VAT')))) +
      el('cac:Price', t('cbc:PriceAmount', amt(i.net), { currencyID: 'SAR' }))) +
    `</Invoice>`;
}
const sha256 = (b: Buffer | string) => createHash('sha256').update(b).digest();
export const xmlHash = (pure: string) => sha256(Buffer.from(pure, 'utf8')).toString('base64');

// ---------------- QR المرحلة الثانية ----------------
function tlvQr(tag: number, v: Buffer) { return Buffer.concat([Buffer.from([tag, v.length]), v]); }
/** يستخرج توقيع الشهادة (آخر BIT STRING) من DER */
function certSignature(der: Buffer) {
  // الشهادة = SEQUENCE { tbs, algo, BIT STRING signature }
  const rd = (b: Buffer, i: number) => { let l = b[i + 1], h = 2; if (l & 0x80) { const n = l & 0x7f; l = 0; for (let k = 0; k < n; k++) l = (l << 8) | b[i + 2 + k]; h = 2 + n; } return { tag: b[i], start: i + h, end: i + h + l }; };
  const top = rd(der, 0); let i = top.start; const parts = [];
  while (i < top.end) { const x = rd(der, i); parts.push(x); i = x.end; }
  const bit = parts[2]; return der.subarray(bit.start + 1, bit.end);
}
export function qr2(o: { seller: string; vat: string; at: string; total: number; tax: number; hash: string; signature: string; publicKey: Buffer; certSig?: Buffer }) {
  const parts = [tlvQr(1, Buffer.from(o.seller)), tlvQr(2, Buffer.from(o.vat)), tlvQr(3, Buffer.from(o.at)), tlvQr(4, Buffer.from(amt(o.total))), tlvQr(5, Buffer.from(amt(o.tax))),
    tlvQr(6, Buffer.from(o.hash)), tlvQr(7, Buffer.from(o.signature)), tlvQr(8, o.publicKey)];
  if (o.certSig) parts.push(tlvQr(9, o.certSig));
  return Buffer.concat(parts).toString('base64');
}

// ---------------- التوقيع (XAdES) ----------------
export function signInvoice(pure: string, certB64: string, privatePem: string, qrFields: { seller: string; vat: string; at: string; total: number; tax: number }, standard: boolean) {
  const hash = xmlHash(pure);
  const key = createPrivateKey(privatePem);
  const signature = createSign('sha256').update(Buffer.from(hash, 'base64')).sign(key).toString('base64');
  const der = Buffer.from(certB64, 'base64'); const x = new X509Certificate(der);
  const certHash = Buffer.from(sha256(certB64).toString('hex')).toString('base64');
  const issuer = x.issuer.split('\n').reverse().join(', '), serial = BigInt('0x' + x.serialNumber).toString(10);
  const signTime = new Date().toISOString().slice(0, 19);
  const signedProps = `<xades:SignedProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Id="xadesSignedProperties"><xades:SignedSignatureProperties><xades:SigningTime>${signTime}</xades:SigningTime><xades:SigningCertificate><xades:Cert><xades:CertDigest><ds:DigestMethod xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"></ds:DigestMethod><ds:DigestValue xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${certHash}</ds:DigestValue></xades:CertDigest><xades:IssuerSerial><ds:X509IssuerName xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${esc(issuer)}</ds:X509IssuerName><ds:X509SerialNumber xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${serial}</ds:X509SerialNumber></xades:IssuerSerial></xades:Cert></xades:SigningCertificate></xades:SignedSignatureProperties></xades:SignedProperties>`;
  const propsHash = Buffer.from(sha256(signedProps).toString('hex')).toString('base64');
  const ublExt = `<ext:UBLExtensions><ext:UBLExtension><ext:ExtensionURI>urn:oasis:names:specification:ubl:dsig:enveloped:xades</ext:ExtensionURI><ext:ExtensionContent><sig:UBLDocumentSignatures xmlns:sac="urn:oasis:names:specification:ubl:schema:xsd:SignatureAggregateComponents-2" xmlns:sbc="urn:oasis:names:specification:ubl:schema:xsd:SignatureBasicComponents-2" xmlns:sig="urn:oasis:names:specification:ubl:schema:xsd:CommonSignatureComponents-2"><sac:SignatureInformation><cbc:ID>urn:oasis:names:specification:ubl:signature:1</cbc:ID><sbc:ReferencedSignatureID>urn:oasis:names:specification:ubl:signature:Invoice</sbc:ReferencedSignatureID><ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="signature"><ds:SignedInfo><ds:CanonicalizationMethod Algorithm="http://www.w3.org/2006/12/xml-c14n11"></ds:CanonicalizationMethod><ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256"></ds:SignatureMethod><ds:Reference Id="invoiceSignedData" URI=""><ds:Transforms><ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116"><ds:XPath>not(//ancestor-or-self::ext:UBLExtensions)</ds:XPath></ds:Transform><ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116"><ds:XPath>not(//ancestor-or-self::cac:Signature)</ds:XPath></ds:Transform><ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116"><ds:XPath>not(//ancestor-or-self::cac:AdditionalDocumentReference[cbc:ID='QR'])</ds:XPath></ds:Transform><ds:Transform Algorithm="http://www.w3.org/2006/12/xml-c14n11"></ds:Transform></ds:Transforms><ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"></ds:DigestMethod><ds:DigestValue>${hash}</ds:DigestValue></ds:Reference><ds:Reference Type="http://www.w3.org/2000/09/xmldsig#SignatureProperties" URI="#xadesSignedProperties"><ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"></ds:DigestMethod><ds:DigestValue>${propsHash}</ds:DigestValue></ds:Reference></ds:SignedInfo><ds:SignatureValue>${signature}</ds:SignatureValue><ds:KeyInfo><ds:X509Data><ds:X509Certificate>${certB64}</ds:X509Certificate></ds:X509Data></ds:KeyInfo><ds:Object><xades:QualifyingProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Target="signature">${signedProps}</xades:QualifyingProperties></ds:Object></ds:Signature></sac:SignatureInformation></sig:UBLDocumentSignatures></ext:ExtensionContent></ext:UBLExtension></ext:UBLExtensions>`;
  const pub = createPublicKey(key).export({ type: 'spki', format: 'der' }) as Buffer;
  const qr = qr2({ ...qrFields, hash, signature, publicKey: pub, certSig: standard ? undefined : certSignature(der) });
  const qrRef = `<cac:AdditionalDocumentReference><cbc:ID>QR</cbc:ID><cac:Attachment><cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${qr}</cbc:EmbeddedDocumentBinaryObject></cac:Attachment></cac:AdditionalDocumentReference>`;
  const sigRef = `<cac:Signature><cbc:ID>urn:oasis:names:specification:ubl:signature:Invoice</cbc:ID><cbc:SignatureMethod>urn:oasis:names:specification:ubl:dsig:enveloped:xades</cbc:SignatureMethod></cac:Signature>`;
  // الإدراج في مواضع ثابتة: الامتدادات أول عنصر، وQR والتوقيع بعد مرجع PIH
  const open = `<Invoice${nsAttrs()}>`;
  const pihEnd = pure.indexOf('</cac:AdditionalDocumentReference>', pure.indexOf('<cbc:ID>PIH</cbc:ID>')) + '</cac:AdditionalDocumentReference>'.length;
  const signed = open + ublExt + pure.slice(open.length, pihEnd) + qrRef + sigRef + pure.slice(pihEnd);
  return { xml: '<?xml version="1.0" encoding="UTF-8"?>\n' + signed, hash, signature, qr };
}
/** يستخرج الفاتورة «النقية» من XML موقّع (للتحقق: يجب أن تعطي نفس التجزئة) */
export function pureFromSigned(xml: string) {
  return xml.replace(/^<\?xml[^>]*\?>\s*/, '').replace(/<ext:UBLExtensions>[\s\S]*?<\/ext:UBLExtensions>/, '').replace(/<cac:Signature>[\s\S]*?<\/cac:Signature>/, '')
    .replace(/<cac:AdditionalDocumentReference><cbc:ID>QR<\/cbc:ID>[\s\S]*?<\/cac:AdditionalDocumentReference>/, '');
}
