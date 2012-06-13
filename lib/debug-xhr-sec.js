const {Ci} = require("chrome");

function log(request) {
  try {
    let channel = request._req.channel,
        secInfo = null, cert = null,
        state = "", status = "",
        verificationResult = null, validity = null;

    // Do we have a valid channel argument?
    if (! channel instanceof  Ci.nsIChannel) {
      console.error("No channel available");
      return;
    }

    secInfo = channel.securityInfo;

    // Print general connection security state
    console.log("Security Info ", channel.name);

    if (secInfo instanceof Ci.nsITransportSecurityInfo) {
      secInfo.QueryInterface(Ci.nsITransportSecurityInfo);
      state = "\tSecurity state: ";
      // Check security state flags
      if ((secInfo.securityState & Ci.nsIWebProgressListener.STATE_IS_SECURE) == Ci.nsIWebProgressListener.STATE_IS_SECURE) {
        state += "secure";
      } else if ((secInfo.securityState & Ci.nsIWebProgressListener.STATE_IS_INSECURE) == Ci.nsIWebProgressListener.STATE_IS_INSECURE) {
        state += "insecure";
      } else if ((secInfo.securityState & Ci.nsIWebProgressListener.STATE_IS_BROKEN) == Ci.nsIWebProgressListener.STATE_IS_BROKEN) {
        state += "unknown";
      }

      console.log(state);
      console.log("\tSecurity description:", secInfo.shortSecurityDescription);
      console.log("\tSecurity error message:", secInfo.errorMessage);
    }
    else {
      console.log("\tNo security info available for this channel");
    }

    // Print SSL certificate details
    if (secInfo instanceof Ci.nsISSLStatusProvider) {
      
      cert = secInfo.QueryInterface(Ci.nsISSLStatusProvider).
             SSLStatus.QueryInterface(Ci.nsISSLStatus).serverCert;

      console.log("Certificate Status:");

      verificationResult = cert.verifyForUsage(Ci.nsIX509Cert.CERT_USAGE_SSLServer);
      status = "\tVerification: "

      switch (verificationResult) {
        case Ci.nsIX509Cert.VERIFIED_OK:
                status += "OK";
                break;
        case Ci.nsIX509Cert.NOT_VERIFIED_UNKNOWN:
                status += "not verfied/unknown";
                break;
        case Ci.nsIX509Cert.CERT_REVOKED:
                status += "revoked";
                break;
        case Ci.nsIX509Cert.CERT_EXPIRED:
                status += "expired";
                break;
        case Ci.nsIX509Cert.CERT_NOT_TRUSTED:
                status += "not trusted";
                break;
        case Ci.nsIX509Cert.ISSUER_NOT_TRUSTED:
                status += "issuer not trusted";
                break;
        case Ci.nsIX509Cert.ISSUER_UNKNOWN:
                status += "issuer unknown";
                break;
        case Ci.nsIX509Cert.INVALID_CA:
                status += "invalid CA";
                break;
        default:
                status += "unexpected failure";
                break;
      }

      console.log(status);
      console.log("\tCommon name (CN) =", cert.commonName);
      console.log("\tOrganisation =", cert.organization);
      console.log("\tIssuer =", cert.issuerOrganization);
      console.log("\tSHA1 fingerprint =", cert.sha1Fingerprint);
      
      validity = cert.validity.QueryInterface(Ci.nsIX509CertValidity);
      console.log("\tValid from", validity.notBeforeGMT);
      console.log("\tValid until", validity.notAfterGMT);
    }
  } catch(err) {
    console.error(err);
  }
}

exports.log = log;
