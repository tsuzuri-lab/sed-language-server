export const gnuManualAcceptanceCorpus = Object.freeze([
  {
    name: "stepped line-number address",
    manualSection: "4.2 Selecting lines by numbers",
    source: "0~4p\n",
    posixDiagnosticCodes: ["command-unknown"],
  },
  {
    name: "relative line-count range",
    manualSection: "4.4 Range Addresses",
    source: "6,+2p\n",
    posixDiagnosticCodes: ["command-unknown"],
  },
  {
    name: "relative line-number multiple range",
    manualSection: "4.4 Range Addresses",
    source: "6,~4p\n",
    posixDiagnosticCodes: ["command-unknown"],
  },
  {
    name: "case-insensitive regexp address",
    manualSection: "4.3 selecting lines by text matching",
    source: "/b/Id\n",
    posixDiagnosticCodes: ["command-unknown"],
  },
  {
    name: "inline append text",
    manualSection: "3.5 Less Frequently-Used Commands",
    source: "2a hello\n",
    posixDiagnosticCodes: ["text-missing-backslash"],
  },
  {
    name: "two addresses on the line-number command",
    manualSection: "3.5 Less Frequently-Used Commands",
    source: "1,2=\n",
    posixDiagnosticCodes: ["address-too-many"],
  },
  {
    name: "list command line-wrap length",
    manualSection: "3.5 Less Frequently-Used Commands",
    source: "l 0\n",
    posixDiagnosticCodes: ["command-unexpected-text"],
  },
  {
    name: "same-line command block",
    manualSection: "3.8 Multiple commands syntax",
    source: "{1d;3d}\n",
    posixDiagnosticCodes: ["block-closing-brace-missing-separator"],
  },
  {
    name: "version requirement",
    manualSection: "3.7 Commands Specific to GNU sed",
    source: "v4.0.5\n",
    posixDiagnosticCodes: ["command-unknown"],
  },
  {
    name: "case-insensitive substitute modifier",
    manualSection: "3.3 The s Command",
    source: "s/hello/world/I\n",
    posixDiagnosticCodes: ["substitute-invalid-flag"],
  },
]);

export const gnuManualRejectionCorpus = Object.freeze([
  {
    name: "line zero outside its special contexts",
    manualSection: "4.5 Zero Address",
    source: "0p\n",
    gnuDiagnosticCodes: ["address-zero-invalid"],
  },
  {
    name: "modifier on an empty regexp address",
    manualSection: "4.3 selecting lines by text matching",
    source: "//Ip\n",
    gnuDiagnosticCodes: ["address-empty-regexp-modifiers"],
  },
  {
    name: "version newer than the target",
    manualSection: "3.7 Commands Specific to GNU sed",
    source: "v4.11\n",
    gnuDiagnosticCodes: ["version-requires-newer-sed"],
  },
]);
