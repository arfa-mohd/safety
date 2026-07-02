"""Generate self-signed SSL certificate for local HTTPS access."""
import datetime, ipaddress, json, os, socket
from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa

# Automatically detect local IP
try:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.connect(('8.8.8.8', 80))
    LOCAL_IP = s.getsockname()[0]
    s.close()
except Exception:
    LOCAL_IP = "127.0.0.1"

CERT_FILE = "cert.pem"
KEY_FILE  = "key.pem"

print(f"Generating SSL Certificate for IP: {LOCAL_IP}")

# Generate private key
key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

subject = issuer = x509.Name([
    x509.NameAttribute(NameOID.COMMON_NAME,         u"Road Safety Local"),
    x509.NameAttribute(NameOID.ORGANIZATION_NAME,   u"Road Safety AI"),
    x509.NameAttribute(NameOID.COUNTRY_NAME,        u"IN"),
])

cert = (
    x509.CertificateBuilder()
    .subject_name(subject)
    .issuer_name(issuer)
    .public_key(key.public_key())
    .serial_number(x509.random_serial_number())
    .not_valid_before(datetime.datetime.utcnow())
    .not_valid_after(datetime.datetime.utcnow() + datetime.timedelta(days=3650))
    .add_extension(
        x509.SubjectAlternativeName([
            x509.DNSName(u"localhost"),
            x509.IPAddress(ipaddress.ip_address(u"127.0.0.1")),
            x509.IPAddress(ipaddress.ip_address(LOCAL_IP)),
        ]),
        critical=False,
    )
    .sign(key, hashes.SHA256())
)

# Write cert and key files
with open(CERT_FILE, "wb") as f:
    f.write(cert.public_bytes(serialization.Encoding.PEM))

with open(KEY_FILE, "wb") as f:
    f.write(key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.TraditionalOpenSSL,
        serialization.NoEncryption(),
    ))

print(f"SSL Certificate generated!")
print(f"   cert: {os.path.abspath(CERT_FILE)}")
print(f"   key : {os.path.abspath(KEY_FILE)}")
print(f"   Valid for IP: {LOCAL_IP}")
print(f"   Valid for 10 years")
