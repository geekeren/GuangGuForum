import { describe, it, expect } from "vitest";
import { htmlToMarkdown } from "../htmlToMarkdown";

describe("htmlToMarkdown", () => {
  it("returns empty string for empty input", () => {
    expect(htmlToMarkdown("")).toBe("");
  });

  // ─── Headings ───

  it("converts h1-h6", () => {
    const md = htmlToMarkdown(`
      <h1>This is a longer heading one</h1>
      <h2>This is a longer heading two</h2>
      <h3>This is a longer heading three</h3>
      <h4>This is a longer heading four</h4>
      <h5>This is a longer heading five</h5>
      <h6>This is a longer heading six</h6>
    `);
    expect(md).toContain("# This is a longer heading one");
    expect(md).toContain("## This is a longer heading two");
    expect(md).toContain("### This is a longer heading three");
    expect(md).toContain("#### This is a longer heading four");
    expect(md).toContain("##### This is a longer heading five");
    expect(md).toContain("###### This is a longer heading six");
  });

  // ─── Inline formatting ───

  it("converts <strong> and <b>", () => {
    const md = htmlToMarkdown("<p>This paragraph has <strong>bold text</strong> inside it</p>");
    expect(md).toContain("**bold text**");
    const md2 = htmlToMarkdown("<p>This paragraph has <b>bold text</b> inside it</p>");
    expect(md2).toContain("**bold text**");
  });

  it("converts <em> and <i>", () => {
    const md = htmlToMarkdown("<p>This paragraph has <em>italic text</em> inside it</p>");
    expect(md).toContain("*italic text*");
    const md2 = htmlToMarkdown("<p>This paragraph has <i>italic text</i> inside it</p>");
    expect(md2).toContain("*italic text*");
  });

  it("converts <del>, <s>, <strike>", () => {
    const md = htmlToMarkdown("<p>This paragraph has <del>removed</del> inside it</p>");
    expect(md).toContain("~~removed~~");
    const md2 = htmlToMarkdown("<p>This paragraph has <s>removed</s> inside it</p>");
    expect(md2).toContain("~~removed~~");
    const md3 = htmlToMarkdown("<p>This paragraph has <strike>removed</strike> inside it</p>");
    expect(md3).toContain("~~removed~~");
  });

  // ─── Links and images ───

  it("converts <a> with href", () => {
    expect(htmlToMarkdown('<a href="https://example.com">link</a>')).toContain(
      "[link](https://example.com)",
    );
  });

  it("returns text only for anchor links (href starting with #)", () => {
    const md = htmlToMarkdown('<p>Click <a href="#top">top navigation link</a> here</p>');
    expect(md).toContain("top navigation link");
    expect(md).not.toContain("](#top)");
  });

  it("converts <img> with src and alt", () => {
    expect(htmlToMarkdown('<img src="pic.png" alt="photo"/>')).toContain(
      "![photo](pic.png)",
    );
  });

  it("converts <img> with data-src", () => {
    expect(htmlToMarkdown('<img data-src="pic.png" alt="photo"/>')).toContain(
      "![photo](pic.png)",
    );
  });

  it("skips <img> without src", () => {
    expect(htmlToMarkdown('<p>A paragraph of content here</p><img alt="no src"/>')).not.toContain("![");
  });

  // ─── Paragraphs and line breaks ───

  it("converts <p>", () => {
    expect(htmlToMarkdown("<p>Hello world paragraph content</p>")).toContain("Hello world paragraph content");
  });

  it("converts <br> to newline within paragraph", () => {
    const md = htmlToMarkdown("<p>line one with enough text<br>line two with enough text</p>");
    expect(md).toContain("line one with enough text");
    expect(md).toContain("line two with enough text");
  });

  it("handles <hr> between paragraphs (separator is filtered as symbol-only line)", () => {
    const md = htmlToMarkdown("<p>Content paragraph above the divider</p><hr><p>Content paragraph below the divider</p>");
    expect(md).toContain("Content paragraph above the divider");
    expect(md).toContain("Content paragraph below the divider");
    // The --- separator is filtered because it contains no letters/numbers
  });

  // ─── Lists ───

  it("converts <ul>", () => {
    const html = "<ul><li>first item with enough text</li><li>second item with enough text</li></ul>";
    const md = htmlToMarkdown(html);
    expect(md).toContain("- first item with enough text");
    expect(md).toContain("- second item with enough text");
  });

  it("converts <ol>", () => {
    const html = "<ol><li>first item with enough text</li><li>second item with enough text</li></ol>";
    const md = htmlToMarkdown(html);
    expect(md).toContain("1. first item with enough text");
    expect(md).toContain("2. second item with enough text");
  });

  // ─── Blockquote ───

  it("converts <blockquote>", () => {
    const md = htmlToMarkdown("<blockquote>This is a longer quote that exceeds fifteen chars</blockquote>");
    expect(md).toContain("> This is a longer quote that exceeds fifteen chars");
  });

  // ─── Code ───

  it("converts inline <code>", () => {
    const md = htmlToMarkdown("<p>Use the <code>forEach</code> method in JavaScript</p>");
    expect(md).toContain("`forEach`");
  });

  it("converts <pre> with code block", () => {
    // node-html-parser does not parse nested tags inside <pre> as elements,
    // so <code> inside <pre> appears as raw text in the output.
    const html = "<pre><code class='language-js'>const greeting = 'hello world';</code></pre>";
    const md = htmlToMarkdown(html);
    expect(md).toContain("const greeting = 'hello world';");
  });

  it("converts <pre> without language class", () => {
    const html = "<pre>This is some plain text code block</pre>";
    const md = htmlToMarkdown(html);
    expect(md).toContain("This is some plain text code block");
  });

  // ─── Tables ───

  it("converts <table>", () => {
    const html = `
      <table>
        <tr><th>Name column header</th><th>Age column header</th></tr>
        <tr><td>Alice Johnson</td><td>30 years old</td></tr>
      </table>`;
    const md = htmlToMarkdown(html);
    expect(md).toContain("| Name column header | Age column header |");
    // The separator line | --- | --- | is filtered out (no letters/numbers)
    expect(md).toContain("| Alice Johnson | 30 years old |");
  });

  // ─── Skipped tags ───

  it("strips <script>, <style>, <nav>, <footer>, <aside>", () => {
    const md = htmlToMarkdown(`
      <p>Visible content paragraph here</p>
      <script>alert(1)</script>
      <style>.x{}</style>
      <nav>menu navigation bar</nav>
      <footer>footer section content</footer>
      <aside>sidebar content here</aside>
    `);
    expect(md).toContain("Visible content paragraph here");
    expect(md).not.toContain("alert");
    expect(md).not.toContain(".x");
    expect(md).not.toContain("menu navigation");
    expect(md).not.toContain("footer section");
    expect(md).not.toContain("sidebar content");
  });

  // ─── Trailing short line removal ───

  it("removes trailing short lines (≤15 chars) like signatures", () => {
    const html = "<p>Main content paragraph with enough text</p><p>来源: xx网</p>";
    const md = htmlToMarkdown(html);
    expect(md).toContain("Main content");
    expect(md).not.toContain("来源");
  });

  it("keeps trailing lines longer than 15 chars", () => {
    const html = "<p>First paragraph here with enough text</p><p>This is a longer trailing line that exceeds 15 characters</p>";
    const md = htmlToMarkdown(html);
    expect(md).toContain("longer trailing line");
  });

  // ─── Complex HTML ───

  it("handles a realistic article snippet", () => {
    const html = `
      <h2>Guide to Testing in JavaScript</h2>
      <p>This is a <strong>guide</strong> about <em>testing</em> web applications.</p>
      <ul><li>Step one: write your first test</li><li>Step two: run all the tests</li></ul>
      <p>Visit <a href="https://example.com">the documentation site</a> for more information.</p>
    `;
    const md = htmlToMarkdown(html);
    expect(md).toContain("## Guide to Testing in JavaScript");
    expect(md).toContain("**guide**");
    expect(md).toContain("*testing*");
    expect(md).toContain("- Step one: write your first test");
    expect(md).toContain("[the documentation site](https://example.com)");
  });
});
