#!/bin/zsh
# usage: pdfextract.sh in.pdf out.pdf "1,2,9,10,11,12,13,14,15,16"  -> new PDF with those pages, in that order
osascript -l JavaScript -e '
ObjC.import("Quartz");
var d = $.PDFDocument.alloc.initWithURL($.NSURL.fileURLWithPath("'"$1"'"));
var nd = $.PDFDocument.alloc.init;
var pages = "'"$3"'".split(",").map(function (s) { return parseInt(s, 10); });
for (var k = 0; k < pages.length; k++) { nd.insertPageAtIndex(d.pageAtIndex(pages[k] - 1), k); }
nd.writeToFile("'"$2"'");
nd.pageCount' 2>&1
