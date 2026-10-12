#!/bin/zsh
# usage: pdftext.sh file.pdf outdir  -> writes outdir/page-NN.txt with the PDF text layer per page
f="$1"; out="$2"; mkdir -p "$out"
osascript -l JavaScript -e '
ObjC.import("Quartz");
var d = $.PDFDocument.alloc.initWithURL($.NSURL.fileURLWithPath("'"$f"'"));
var n = d.pageCount;
for (var i = 0; i < n; i++) {
  var s = d.pageAtIndex(i).string;
  var txt = s.isNil() ? "" : ObjC.unwrap(s);
  var name = "'"$out"'/page-" + String(i + 1).padStart(2, "0") + ".txt";
  $.NSString.alloc.initWithUTF8String(txt).writeToFileAtomicallyEncodingError(name, true, $.NSUTF8StringEncoding, null);
}
n' 2>&1
