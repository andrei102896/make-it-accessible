#!/bin/zsh
# usage: pdfrender.sh file.pdf outdir first last [dpi]  -> outdir/page-NN.png via Quartz (no poppler needed)
f="$1"; out="$2"; first="$3"; last="$4"; dpi="${5:-150}"; mkdir -p "$out"
osascript -l JavaScript -e '
ObjC.import("Quartz"); ObjC.import("AppKit");
var d = $.PDFDocument.alloc.initWithURL($.NSURL.fileURLWithPath("'"$f"'"));
var scale = '"$dpi"' / 72;
for (var i = '"$first"' - 1; i < '"$last"' && i < d.pageCount; i++) {
  var p = d.pageAtIndex(i);
  var b = p.boundsForBox($.kPDFDisplayBoxMediaBox);
  var w = Math.round(b.size.width * scale), h = Math.round(b.size.height * scale);
  var img = p.thumbnailOfSizeForBox($.NSMakeSize(w, h), $.kPDFDisplayBoxMediaBox);
  var rep = $.NSBitmapImageRep.imageRepWithData(img.TIFFRepresentation);
  var png = rep.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $.NSDictionary.dictionary);
  png.writeToFileAtomically("'"$out"'/page-" + String(i + 1).padStart(2, "0") + ".png", true);
}
"ok"' 2>&1
