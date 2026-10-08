/* sims.js — scripted Debug replays for ledger PRs, as data.
   script.js plays these in the terminal when a PR has no hand-built simulation.
   Each replay follows the reproduction in the PR's own description: the
   behaviour before the fix, then after it.

   Step:  { c: "command typed at the prompt", p: "prompt (default shell)", o: [output lines] }
   Output line prefixes:  "# " muted note · "!" failure · "+" pass · "*" accent
   Inline, mid-line:      [[!text]] failure · [[+text]] pass · [[*text]] accent */
window.DECK_SIMS = {

  "systemd/systemd#43753": [
    { c: "git switch --detach main~1   # before the fix", o: [] },
    { c: "./build/test-parse-util --loadavg '9007199254740992.00'", o: [
      "parse_loadavg_fixed_point(\"9007199254740992.00\") -> 0, fp = 0.00",
      "!accepted: 2^53 << 11 shifted out of the word and wrapped to zero",
      "# guard was i >= (~0UL << 11) = 0xFFFFFFFFFFFFF800: shift direction inverted" ] },
    { c: "./build/test-parse-util --loadavg '1.9007199254740992'", o: [
      "parse_loadavg_fixed_point(\"1.9007199254740992\") -> 0, fp = 1.00",
      "!accepted: fraction shifted first, range-checked after it had wrapped" ] },
    { c: "git switch --detach 43753   # validate both parts before shifting", o: [] },
    { c: "./build/test-parse-util --loadavg '9007199254740992.00' '1.9007199254740992'", o: [
      "+9007199254740992.00  -> -ERANGE",
      "+1.9007199254740992   -> -ERANGE",
      "# valid input unchanged: DIV_ROUND_UP(99 << 11, 100) == 2028 either way" ] }
  ],

  "util-linux/util-linux#4621": [
    { c: "printf '\\033[Khome\\tB\\nxx\\tD\\n' | column -t -s $'\\t' | cat -v", o: [
      "^[[Khome      |B",
      "xx     |D",
      "!misaligned: mbs_nwidth() scanned for 'm' and swallowed \"home\" (measured 1 cell, not 4)" ] },
    { c: "./tests/run.sh column/ansiescape --subtest csi", o: [
      "!column: ansiescape csi ... FAILED   (\\e[K, \\e[2J, \\e[?25l)" ] },
    { c: "git switch fix/mbsalign-csi   # bound the scan to an ECMA-48 CSI sequence", o: [
      "# params 0x30-0x3f, intermediates 0x20-0x2f, final byte 0x40-0x7e" ] },
    { c: "printf '\\033[Khome\\tB\\nxx\\tD\\n' | column -t -s $'\\t' | cat -v", o: [
      "^[[Khome  |B",
      "xx    |D" ] },
    { c: "./tests/run.sh", o: [
      "+All 408 tests PASSED" ] }
  ],

  "util-linux/util-linux#4653": [
    { c: "setpriv --landlock-access fs:remove rm -v victim", o: [
      "!removed 'victim'",
      "# \"remove\" matched as a prefix: strncmp() used the length of what was typed,",
      "# so it resolved to remove-dir and removing files was never restricted" ] },
    { c: "setpriv --landlock-access fs:make mkdir newdir", o: [
      "!(mkdir succeeds: only make-char was handled)" ] },
    { c: "setpriv --landlock-access net:bind true", o: [
      "setpriv: could not parse Landlock net access: bind",
      "# the net and scope parsers in the same file already compared the full name" ] },
    { c: "git switch fix/landlock-fs-exact   # match filesystem rights exactly", o: [] },
    { c: "setpriv --landlock-access fs:remove rm -v victim", o: [
      "+setpriv: could not parse Landlock fs access: remove",
      "# a typo is now an error, not a weaker sandbox than you asked for" ] },
    { c: "./tests/run.sh setpriv/landlock", o: [
      "+abbreviated-fs-right ... OK   (fails without the fix)",
      "+all 21 subtests passed   (Linux 7.2, Landlock ABI 10)" ] }
  ],

  "systemd/systemd#43714": [
    { c: "nm -C build/src/shared/libsystemd-shared.so | grep sipround", o: [
      "t sipround   (a local, out-of-line function)",
      "# gcc -O2 declines to inline it: just over max-inline-insns-auto" ] },
    { c: "./build/bench-siphash --sizes 8,16,64,512", o: [
      "   8 B   61.3 ns", "  16 B   54.6 ns", "  64 B   53.2 ns", " 512 B  157.7 ns" ] },
    { c: "git switch --detach 43714   # _always_inline_ on the round", o: [] },
    { c: "nm -C build/src/shared/libsystemd-shared.so | grep sipround", o: [
      "+(no symbol: sipround is inlined at all ten call sites)" ] },
    { c: "./build/bench-siphash --sizes 8,16,64,512", o: [
      "+   8 B    9.3 ns   6.63x",
      "+  16 B   10.7 ns   5.11x",
      "+  64 B   22.1 ns   2.41x",
      " 512 B  128.1 ns   1.23x",
      "# short keys dominate hashmap lookups, which is where the win lands" ] }
  ],

  "systemd/systemd#43663": [
    { c: "du -sh /var/log/journal   # 100 files, ~2M entries", o: [ "730M\t/var/log/journal" ] },
    { c: "time journalctl -o cat > /dev/null", o: [ "real\t0m1.93s" ] },
    { c: "perf report --stdio | grep utf8_encoded", o: [
      "  utf8_encoded_valid_unichar   (decodes to validate, drops the codepoint)",
      "  utf8_encoded_to_unichar      (decodes the same character again)",
      "!every byte decoded twice just to ask whether it is a control character" ] },
    { c: "git switch --detach 43663", o: [ "# decode once, return the codepoint the validator already computed" ] },
    { c: "time journalctl -o cat > /dev/null", o: [ "+real\t0m0.77s   2.51x" ] },
    { c: "time journalctl > /dev/null   # default -o short", o: [ "+real\t0m1.96s   1.69x (was 3.32s)" ] },
    { c: "cmp <(journalctl.old -o export) <(journalctl -o export) && echo identical", o: [
      "+identical   (byte for byte, every format but json key order)" ] }
  ],

  "systemd/systemd#43653": [
    { c: "./build/test-format-table --cell $'\\xed\\xa0\\x80 lead surrogate' --width 20", o: [
      "valid_utf8=0  utf8_console_width=25  ellipsize=NULL",
      "!table_format: Cannot allocate memory",
      "# width path used the permissive decoder; ellipsize() validated strictly" ] },
    { c: "./build/test-utf8 --exhaustive 1..4   # every NUL-free byte string", o: [
      "checked 4,244,897,280 sequences against utf8_is_valid_n()",
      "  utf8_encoded_valid_unichar()   0 disagreements",
      "!  utf8_encoded_to_unichar()      8,835,838 disagreements" ] },
    { c: "git switch --detach 43653", o: [] },
    { c: "./build/test-format-table --cell $'\\xed\\xa0\\x80 lead surrogate' --width 20", o: [
      "+table_format: Invalid argument   (-EINVAL, consistently, at any terminal width)" ] }
  ],

  "systemd/systemd#43650": [
    { c: "systemctl start systemd-resolved && resolvectl mdns eth0 yes", o: [] },
    { c: "./send-udp --bad-checksum 224.0.0.251:5353   # from any host on the link", o: [
      "sent 1 datagram (checksum 0xdead)" ] },
    { c: "journalctl -u systemd-resolved -p debug -n 2", o: [
      "manager_recv: next_datagram_size_fd() -> -EAGAIN (kernel dropped it on MSG_PEEK)",
      "!Event source 'mdns-ipv4' returned error, disabling: Resource temporarily unavailable" ] },
    { c: "avahi-browse -art | head -1", o: [ "!(nothing: mDNS is deaf until resolved restarts)" ] },
    { c: "git switch --detach 43650   # transient peek errors mean \"no packet\"", o: [] },
    { c: "./send-udp --bad-checksum 224.0.0.251:5353 && avahi-browse -art | head -1", o: [
      "+= eth0 IPv4 printer  _ipp._tcp  local    (listener still serving)" ] }
  ],

  "systemd/systemd#43608": [
    { c: "meson configure build -Db_sanitize=address && ninja -C build", o: [] },
    { c: "varlinkctl call --more $RESOLVE io.systemd.Resolve.BrowseServices '{...}'", o: [
      "service n_ref: 1 (list) -> 2 (query) -> 3 (complete, leaked) -> 2",
      "subscription torn down: browser freed, service still alive at n_ref 1" ] },
    { c: "journalctl -u systemd-resolved -n 3", o: [
      "!==412==ERROR: AddressSanitizer: heap-use-after-free",
      "!READ of size 8 in mdns_maintenance_query src/resolve/resolved-dns-browse-services.c",
      "# the maintenance timer fired against the freed DnsServiceBrowser" ] },
    { c: "git show 43608 --stat", o: [ " resolved-dns-browse-services.c | 2 +-   (_cleanup_ the reference)" ] },
    { c: "# rerun the same subscription", o: [ "+clean exit, no ASan report; service freed with its browser" ] }
  ],

  "systemd/systemd#43589": [
    { c: "grep -n compress_blob src/fuzz/fuzz-compress.c", o: [
      "# the old fuzzer compressed its input first, so decoders only saw well-formed streams" ] },
    { c: "./build/fuzz-decompress -max_total_time=600 corpus/", o: [
      "!truncated stream: decompress_stream() buffer grows without bound" ] },
    { c: "git switch --detach 43589", o: [
      "# fix the growth on truncated input, add fuzz-decompress and fuzz-qcow2" ] },
    { c: "./build/fuzz-decompress -max_total_time=600 corpus/", o: [
      "+hostile streams into all four entrypoints: no crashes, output size capped" ] },
    { c: "./build/fuzz-qcow2 -max_total_time=300 corpus-qcow2/", o: [
      "+qcow2_detect()/qcow2_convert() over hostile L1/L2 tables: clean" ] }
  ],

  "systemd/systemd#43333": [
    { c: "systemd-detect-virt --=foo", o: [
      "!option '--' is ambiguous; possibilities: --help, --version, --quiet, --container, ...",
      "# an empty name is a prefix of every long option" ] },
    { c: "./build/test-options --case single-long-option -- --=foo", o: [
      "!parsed as --output=foo   (the empty name uniquely matched the only option)" ] },
    { c: "git switch --detach 43333", o: [] },
    { c: "systemd-detect-virt --=foo", o: [
      "+systemd-detect-virt: unrecognized option '--=foo'" ] },
    { c: "systemd-detect-virt -- --vm", o: [ "+(bare -- still ends option parsing)" ] }
  ],

  "systemd/systemd#43326": [
    { c: "./build/test-strv rebreak 'foo\\n' --width 80", o: [
      "!got [\"\"]   want [\"foo\"]   (text before the newline dropped)" ] },
    { c: "./build/test-strv rebreak 'hello world\\nfoo bar baz quux waldo' --width 10", o: [
      "!got [\"hello\", \"world\\nfoo bar\", \"baz quux\", \"waldo\"]",
      "# one entry spans two lines: varlink IDL would print the second uncommented" ] },
    { c: "git switch --detach 43326   # flush the line at every newline", o: [] },
    { c: "./build/test-strv", o: [
      "+rebreak 'foo\\n'            -> [\"foo\"]",
      "+rebreak 'hello world\\n...' -> [\"hello\", \"world\", \"foo bar\", \"baz quux\", \"waldo\"]",
      "+CRLF counts as one break; all tests passed" ] }
  ],

  "coreos/afterburn#1295": [
    { c: "afterburn --provider=aws --hostname=/etc/hostname   # 70-byte hostname, é at byte 64", o: [
      "!thread 'main' panicked at src/providers/mod.rs:205:",
      "!assertion failed: self.is_char_boundary(new_len)",
      "# String::truncate(64) counts bytes; byte 64 fell inside a UTF-8 character" ] },
    { c: "systemctl status afterburn-hostname.service | head -2", o: [ "!Active: failed (Result: core-dump)" ] },
    { c: "git switch fix/truncate-hostname   # walk back to a char boundary", o: [] },
    { c: "cargo test truncate_hostname", o: [
      "+test providers::tests::truncate_hostname_multibyte ... ok",
      "+test result: ok. 150 passed; 0 failed" ] }
  ],

  "coreos/afterburn#1294": [
    { c: "cat network-config | yq '.config[] | select(.type == \"nameserver\")'", o: [
      "address: [192.168.88.30, 192.168.88.31]" ] },
    { c: "afterburn exp rd-network-kargs --provider proxmoxve", o: [
      "ip=192.168.88.10::192.168.88.1:255.255.255.0::eth0:none",
      "!nameserver=192.168.88.30,192.168.88.31",
      "# dracut has no comma form: the whole value is discarded, DNS stays unset" ] },
    { c: "git switch fix/proxmox-nameservers   # issue #1225", o: [] },
    { c: "afterburn exp rd-network-kargs --provider proxmoxve", o: [
      "ip=192.168.88.10::192.168.88.1:255.255.255.0::eth0:none",
      "+nameserver=192.168.88.30",
      "+nameserver=192.168.88.31",
      "+nameserver=[2001:db8::1]   (IPv6 bracketed, deduplicated across interfaces)" ] }
  ],

  "BerriAI/litellm#35455": [
    { c: "ANTHROPIC_BASE_URL=http://localhost:4000 claude", o: [
      "/model", "!No models discovered from gateway",
      "# Claude Code parses only the Anthropic Models shape; litellm served OpenAI's" ] },
    { c: "curl -s localhost:4000/v1/models -H 'anthropic-version: 2023-06-01' | jq '.data[0]'", o: [
      "+{ \"type\": \"model\", \"id\": \"claude-sonnet-5\", \"display_name\": \"claude-sonnet-5\",",
      "+  \"created_at\": \"2026-08-14T00:00:00Z\", \"max_input_tokens\": 200000, \"max_tokens\": 64000 }" ] },
    { c: "curl -s localhost:4000/v1/models | jq '.data[0] | keys'", o: [
      "[\"created\", \"id\", \"object\", \"owned_by\"]   # no header: OpenAI shape, byte for byte" ] },
    { c: "# re-land of #30273 after a staging revert; the diff is purely additive", o: [
      "+/model picker populated through the gateway" ] }
  ],

  "systemd/systemd#43230": [
    { c: "./build/test-ellipsize $'🐱🐱\\x1bM🐱🐱\\x1bM' --width 5", o: [
      "!…\\x1bM🐱\\x1bM   (3 cells: ESC M at length-2 counted as two characters)",
      "# the loop reads s + (i - 1) while i starts at length-2: one offset never checked" ] },
    { c: "git switch --detach 43230", o: [] },
    { c: "./build/test-ellipsize $'🐱🐱\\x1bM🐱🐱\\x1bM' --width 5", o: [
      "+…\\x1bM🐱🐱\\x1bM   (5 cells, as requested)" ] }
  ],

  "systemd/systemd#43150": [
    { c: "systemd-ask-password --id=$'x\\nSocket=/tmp/evil' 'Disk passphrase:' &", o: [] },
    { c: "cat /run/systemd/ask-password/ask.* | tail -3", o: [
      "Message=Disk passphrase:",
      "Id=x",
      "!Socket=/tmp/evil   (injected: a later assignment overrides the real Socket=)" ] },
    { c: "systemd-tty-ask-password-agent --query", o: [
      "!Disk passphrase: ********   -> sent to /tmp/evil" ] },
    { c: "git switch --detach 43150   # refuse unsafe characters in message/icon/id", o: [] },
    { c: "systemd-ask-password --id=$'x\\nSocket=/tmp/evil' 'Disk passphrase:'", o: [
      "+Failed to query password: Invalid argument   (no request file written)" ] }
  ],

  "systemd/systemd#43102": [
    { c: "systemd-ask-password --plymouth \"$(printf 'P%.0s' {1..255})\"", o: [
      "# plymouth encodes prompt length + NUL in one byte" ] },
    { c: "xxd -l 4 /tmp/plymouth-packet.bin", o: [
      "!00000000: 2a02 0050   len byte = 0x00: (255 + 1) wrapped",
      "!plymouthd: parsed the rest of the prompt as protocol data" ] },
    { c: "git switch --detach 43102   # shared packet builder", o: [] },
    { c: "./build/test-ask-password-plymouth", o: [
      "+254-byte prompt   -> encoded exactly, len byte 0xff",
      "+255-byte prompt   -> -EMSGSIZE, nothing sent",
      "+cached-password fallback uses the same builder" ] }
  ],

  "systemd/systemd#43079": [
    { c: "./build/test-escape --cunescape '\\ud800' | xxd", o: [
      "!00000000: eda0 80   (a lone surrogate re-encoded as WTF-8, not valid UTF-8)" ] },
    { c: "./build/test-escape --cunescape '\\U0000d800'", o: [ "-EINVAL   # the long form already refused it" ] },
    { c: "git switch --detach 43079   # utf16_is_surrogate() in the \\u path", o: [] },
    { c: "./build/test-escape", o: [
      "+\\ud800  -> -EINVAL",
      "+\\udfff  -> -EINVAL",
      "+\\ufffe  -> U+FFFE   (noncharacters still round-trip for fstab-generator)" ] }
  ],

  "systemd/systemd#43078": [
    { c: "meson configure build -Db_sanitize=address && ninja -C build test-strv", o: [] },
    { c: "./build/test-strv rebreak $'\\xF0'   # stored as F0 00", o: [
      "!==8812==ERROR: AddressSanitizer: heap-buffer-overflow",
      "!READ of size 1 ... 2 bytes after 2-byte region",
      "# utf8_next_char() trusts the lead byte and skips 4, stepping over the NUL" ] },
    { c: "git switch --detach 43078   # advance by 1 on invalid UTF-8", o: [] },
    { c: "./build/test-strv rebreak $'\\xF0' $'\\xFC'", o: [
      "+no out-of-bounds read; invalid bytes counted as one cell each" ] }
  ],

  "systemd/systemd#43077": [
    { c: "for h in foobar-- foobar-. foobar.-; do ./build/test-hostname-util --cleanup $h; done", o: [
      "!foobar--  -> foobar-",
      "!foobar-.  -> foobar-",
      "!foobar.-  -> foobar.",
      "# comment said \"hence the loop\"; the code was a single if" ] },
    { c: "git switch --detach 43077   # if -> while", o: [] },
    { c: "./build/test-hostname-util", o: [
      "+foobar--   -> foobar",
      "+foobar-.-  -> foobar",
      "+foo-bar-.-com-. -> foo-bar--com   (unchanged)" ] }
  ],

  "lance-format/lance#7845": [
    { c: "python -c 'tbl.search().where(\"contains(text, \\'ab\\')\").to_arrow().num_rows'", o: [
      "!0   # with an NGRAM index, although matching rows exist" ] },
    { c: "# a 2-char needle yields no trigram: the index returns AtLeast(empty)", o: [
      "# a lower bound meaning \"recheck everything\", read as the final answer" ] },
    { c: "git switch fix/ngram-subtrigram   # bypass the index when len < NGRAM_N", o: [] },
    { c: "python -c 'tbl.search().where(\"contains(text, \\'ab\\')\").to_arrow().num_rows'", o: [
      "+same rows as an unindexed scan, like LIKE and regexp_match already returned" ] }
  ],

  "lancedb/lancedb#3599": [
    { c: "python -m pytest tests/test_rerankers.py -k mrr_consensus", o: [
      "doc A: #1 in 1 of 3 rankings    score = mean([1.0])      = 1.000",
      "doc B: #1, #1, #2 in all 3      score = mean([1, 1, .5]) = 0.833",
      "!FAILED: A ranked above B; missing rankings never counted as 0" ] },
    { c: "git switch fix/mrr-denominator   # divide by all rankings", o: [] },
    { c: "python -m pytest tests/test_rerankers.py -k mrr", o: [
      "doc A: 1.0 / 3 = 0.333",
      "doc B: 2.5 / 3 = 0.833",
      "+PASSED: consensus wins, matching rerank_hybrid" ] }
  ]
};

/* The first eighteen PRs, rewritten to follow each PR's own description
   (its reproduction, root cause and tests) like the replays above. */
Object.assign(window.DECK_SIMS, {

  "BerriAI/litellm#30020": [
    { c: "KEY=$(mint-key --max-parallel-requests 1)   # one concurrent request", o: [] },
    { c: "curl -s -o /dev/null -w '%{http_code}' $BASE/v1/chat/completions ...", o: [ "200   # baseline on the fresh key" ] },
    { c: "curl -sN --max-time 2 $BASE/v1/chat/completions -d '{\"stream\": true, ...}'", o: [
      "stream aborted mid-flight (client disconnect)",
      "# CancelledError is a BaseException: it slips past `except Exception`",
      "# so neither logging callback runs and the +1 slot is never released" ] },
    { c: "curl -s -o /dev/null -w '%{http_code}' $BASE/v1/chat/completions ...", o: [
      "!429   max_parallel_requests: Current limit: 1, Remaining: 0",
      "!the key stays pinned until the window TTL expires" ] },
    { c: "git switch --detach 30020   # release the slot when a stream is cancelled", o: [] },
    { c: "./repro.sh", o: [
      "[2] baseline normal request on fresh key -> 200",
      "[3] streaming request aborted mid-stream",
      "+[4] post-cancel normal request on same key -> 200" ] }
  ],

  "python/cpython#150328": [
    { c: "grep -n 'ac_sys_system=Cygwin' configure.ac", o: [
      "!ac_sys_system=Cygwin   # every case pattern below matches CYGWIN*" ] },
    { c: "./configure --disable-shared && grep -E '^(LDLIBRARY|LDSHARED)' Makefile", o: [
      "!LDLIBRARY=libpython$(LDVERSION).dll.a   # a DLL import library, for a static build",
      "!LDSHARED=gcc -shared ...                # ignores the configured compiler" ] },
    { c: "git switch gh-150311", o: [ "# three fixes to the Cygwin port in configure.ac" ] },
    { c: "./configure --disable-shared CC=clang && grep -E '^(LDLIBRARY|LDSHARED|LDCXXSHARED)' Makefile", o: [
      "+LDLIBRARY=libpython$(LDVERSION).a",
      "+LDSHARED=$(CC) -shared ...",
      "+LDCXXSHARED=$(CXX) -shared ...   # same as UnixWare and SCO_SV" ] }
  ],

  "lance-format/lance#6934": [
    { c: "rg -n 'UpdateIf' rust/lance/src/dataset/write/merge_insert.rs", o: [
      "WhenMatched::UpdateIf(String)   # SQL only, parsed when the plan is built",
      "# callers building predicates in code had to print them to SQL and parse them back" ] },
    { c: "git switch feat/merge-insert-expr", o: [
      "# new WhenMatched::UpdateIfExpr(datafusion_expr::Expr) + update_if_expr()" ] },
    { c: "cargo test -p lance merge_insert", o: [
      "planner: optimize the logical Expr, convert straight to a physical expr",
      "assign_action / DisplayAs / Explain handle the new variant",
      "+test result: ok" ] },
    { c: "# verified downstream in lancedb (lancedb#3444)", o: [ "+Closes #6861" ] }
  ],

  "lancedb/lancedb#3444": [
    { c: "rg -n 'fn when_matched_update_all' rust/lancedb/src/table/merge.rs", o: [
      "when_matched_update_all(condition: Option<String>)   # SQL strings only" ] },
    { c: "git switch feat/merge-insert-expr   # builds on lance#6934", o: [
      "# MergeFilter holds either a SQL string or a datafusion_expr::Expr",
      "# + when_matched_update_all_expr, when_not_matched_by_source_delete_expr" ] },
    { c: "cargo test -p lancedb test_merge_insert_expr", o: [
      "conditional update with a programmatic Expr ... ok",
      "conditional delete with a programmatic Expr ... ok",
      "+test result: ok" ] },
    { c: "# remote tables serialize over HTTP/JSON and can't carry an Expr tree", o: [
      "+remote table + Expr filter -> Error::NotSupported, instead of a wrong query" ] }
  ],

  "lancedb/lancedb#3459": [
    { c: "rg -n 'run_in_executor' python/lancedb/table.py", o: [
      "await loop.run_in_executor(None, compute_query_embeddings_with_retry, query)",
      "# None = asyncio's default pool, shared with every other blocking call" ] },
    { c: "python bench/concurrent_search.py --slow-embedder", o: [
      "!slow embedding calls hold the default pool's threads",
      "!unrelated run_in_executor(None, ...) work queues behind them" ] },
    { c: "git switch fix/embedding-executor   # closes #3310", o: [
      "# ThreadPoolExecutor(thread_name_prefix=\"lancedb-embedding\"), reset after fork()" ] },
    { c: "python bench/concurrent_search.py --slow-embedder", o: [
      "+embeddings run on lancedb-embedding-* threads; the default pool stays free" ] }
  ],

  "lightpanda-io/browser#2537": [
    { c: "lightpanda eval 'new File([\"hi\"], \"a.txt\")'", o: [
      "!ReferenceError: File is not defined" ] },
    { c: "git switch feat/webapi-file   # File extends Blob", o: [
      "# reuses Blob's validateMimeType and writePartWithEndings" ] },
    { c: "lightpanda eval 'const f = new File([\"hi\"], \"a.txt\", {type: \"text/plain\"}); [f.name, f.size, f.type, typeof f.lastModified]'", o: [
      "+[\"a.txt\", 2, \"text/plain\", \"number\"]",
      "# lastModified maps to f64, so JS never sees a BigInt" ] },
    { c: "make test F=file.html", o: [ "+file.html: all passed" ] }
  ],

  "lightpanda-io/browser#2635": [
    { c: "lightpanda eval 'document.querySelector(\"input[type=file]\").files.length'", o: [
      "!0   # FileList was a zero-size stub" ] },
    { c: "git switch feat/input-file   # closes #2175", o: [] },
    { c: "cdp DOM.setFileInputFiles '{\"files\": [\"/tmp/report.pdf\"], \"nodeId\": 7}'", o: [
      "loaded report.pdf (application/pdf, sniffed by extension)",
      "fired input, change" ] },
    { c: "lightpanda eval 'const i = $(\"input[type=file]\"); [i.files.length, i.files.item(0).name, i.value]'", o: [
      "+[1, \"report.pdf\", \"C:\\\\fakepath\\\\report.pdf\"]" ] },
    { c: "make test", o: [
      "+input_file.html, cdp.dom setFileInputFiles: passed",
      "+partial-failure path: no leaked arena" ] }
  ],

  "BerriAI/litellm#29493": [
    { c: "redis-cli GET spend:key:$TOKEN   # multi-replica proxy since v1.84.0", o: [
      "# reserved at auth, released in the success or failure callback",
      "!a disconnect or timeout skips both: the reservation is never given back" ] },
    { c: "curl -s $BASE/v1/chat/completions -H \"Authorization: Bearer $KEY\" ...", o: [
      "!429 BudgetExceededError   # database spend is well under budget" ] },
    { c: "git switch feat/disable-budget-reservation   # #27639", o: [] },
    { c: "yq '.general_settings.disable_budget_reservation = true' -i config.yaml && restart-proxy", o: [
      "# returns before reserving: nothing is incremented, so nothing to unwind" ] },
    { c: "curl -s -o /dev/null -w '%{http_code}' $BASE/v1/chat/completions ...", o: [
      "+200   # enforcement as it worked before v1.84.0" ] }
  ],

  "BerriAI/litellm#29483": [
    { c: "curl -s $BASE/v1/models -H \"Authorization: Bearer $EXHAUSTED_KEY\" | jq .error.type", o: [
      "!\"budget_exceeded\"   (429)",
      "# every OpenAI client lists models at startup, so the whole integration breaks" ] },
    { c: "rg -n 'skip_budget_checks' litellm/proxy/auth/auth_checks.py", o: [
      "# the global check already exempted /v1/models; team, key, org and user checks didn't" ] },
    { c: "git switch fix/discovery-budget   # fixes #27923", o: [
      "# MODEL_DISCOVERY_ROUTES: a narrow frozenset, not every info route" ] },
    { c: "curl -s $BASE/v1/models -H \"Authorization: Bearer $EXHAUSTED_KEY\" | jq '.data | length'", o: [
      "+the full model list, as with any other key" ] },
    { c: "curl -s -o /dev/null -w '%{http_code}' $BASE/v1/chat/completions -H \"Authorization: Bearer $EXHAUSTED_KEY\" ...", o: [
      "+429   # inference stays budget-enforced" ] }
  ],

  "lancedb/lancedb#3511": [
    { c: "python -c 'class Doc(LanceModel): items: Tuple\\nDoc.to_arrow_schema()'", o: [
      "!AttributeError: __args__",
      "# a bare Tuple has __origin__ == tuple but no __args__ to read" ] },
    { c: "python -c 'class Doc(LanceModel): m: Dict[str, int]\\nDoc.to_arrow_schema()'", o: [
      "TypeError: ... (a clear message naming the unsupported type)",
      "# other unsupported types already fail clearly" ] },
    { c: "git switch fix/bare-generic   # closes #3502", o: [] },
    { c: "pytest python/tests/test_pydantic.py -k bare_generic", o: [
      "+List  -> TypeError (clear message)",
      "+Tuple -> TypeError (clear message)",
      "+1 passed" ] }
  ],

  "lancedb/lancedb#3512": [
    { c: "rg -n 'unwrap()' rust/lancedb/src/embeddings/bedrock.rs", o: [
      "serde_json::to_vec(&request_body).unwrap()",
      "block_in_place(...).unwrap()   # any AWS API error kills the worker",
      "v.as_f64().unwrap() as f32     # a non-numeric value panics" ] },
    { c: "cargo run --example bedrock_embed   # current-thread runtime", o: [
      "!thread 'main' panicked: can call blocking only when running on the multi-threaded runtime" ] },
    { c: "git switch fix/bedrock-typed-errors   # closes #3506", o: [
      "# json_array_to_f32 + current_multi_thread_handle(), errors via ?" ] },
    { c: "cargo test -p lancedb bedrock", o: [
      "+json_array_to_f32: numbers, non-array, non-numeric ... ok",
      "+current_multi_thread_handle: none, current-thread, multi-thread ... ok",
      "+6 passed; no AWS credentials needed" ] }
  ],

  "BerriAI/litellm#30272": [
    { c: "curl -s $BASE/v1/models | jq '.data[0]'", o: [
      "{ \"id\": \"gpt-4o\", \"object\": \"model\", \"created\": ..., \"owned_by\": \"openai\" }",
      "!no context window: agents that compact context have to guess" ] },
    { c: "git switch feat/models-token-limits   # fixes #25293", o: [
      "# create_model_info_response adds the limits the router already knows" ] },
    { c: "curl -s $BASE/v1/models | jq '.data[0]'", o: [
      "+{ \"id\": \"gpt-4o\", ..., \"max_input_tokens\": 128000, \"max_output_tokens\": 16384 }",
      "# ints, not 128000.0; omitted when unknown, so wildcard routes are unchanged" ] },
    { c: "pytest tests/test_litellm/proxy -k models_token_limits", o: [ "+7 passed" ] }
  ],

  "BerriAI/litellm#30273": [
    { c: "ANTHROPIC_BASE_URL=$BASE claude   # then open /model", o: [
      "!model picker is empty",
      "# discovery parses the Anthropic Models shape; the gateway spoke OpenAI's" ] },
    { c: "git switch feat/anthropic-models   # fixes #27180", o: [
      "# content negotiation on the anthropic-version header, same route" ] },
    { c: "curl -s $BASE/v1/models -H 'anthropic-version: 2023-06-01' | jq '{has_more, first_id}'", o: [
      "+{ \"has_more\": false, \"first_id\": \"claude-sonnet-5\" }" ] },
    { c: "curl -s $BASE/v1/models | jq '.object'", o: [
      "\"list\"   # no header: the OpenAI shape, byte for byte" ] },
    { c: "# later reverted in staging and re-landed as #35455", o: [] }
  ],

  "lightpanda-io/browser#2722": [
    { c: "cdp Browser.setDownloadBehavior '{\"behavior\": \"allow\", \"downloadPath\": \"/tmp/dl\"}'", o: [
      "!{}   # a no-op: every parameter was commented out" ] },
    { c: "cdp Page.navigate '{\"url\": \"http://localhost:8000/report.csv\"}'   # Content-Disposition: attachment", o: [
      "!parsed as a page, body discarded, nothing written to /tmp/dl" ] },
    { c: "git switch feat/cdp-downloads   # fixes #2701", o: [] },
    { c: "cdp Page.navigate '{\"url\": \"http://localhost:8000/report.csv\"}'", o: [
      "Page.downloadWillBegin   suggestedFilename=report.csv",
      "Browser.downloadProgress state=inProgress",
      "+Browser.downloadProgress state=completed",
      "+/tmp/dl/report.csv written   (path components stripped against traversal)" ] }
  ],

  "lance-format/lance#7246": [
    { c: "python repro_3352.py   # FTS on list<string> + where(...) prefilter", o: [
      "keywords [\"needle\", \"synonym\"]  prefilter: 0 rows   postfilter: 2 rows",
      "keywords [\"synonym\", \"needle\"]  prefilter: 2 rows   postfilter: 2 rows",
      "!prefilter misses the token unless it is the list's last element" ] },
    { c: "rg -n 'fn doc_id' rust/lance-index/src/scalar/inverted", o: [
      "# one row owns a doc per list element; doc_id(row_id) returned just one" ] },
    { c: "git switch fix/fts-prefilter-list", o: [
      "# doc_ids(row_id) yields every doc; flat_search expands each allowed row" ] },
    { c: "python repro_3352.py", o: [
      "+keywords [\"needle\", \"synonym\"]  prefilter: 2 rows   postfilter: 2 rows" ] }
  ],

  "lance-format/lance#7251": [
    { c: "python repro_3515.py   # scalar index on path, vector column all None", o: [
      "tbl.merge_insert(\"path\").when_matched_update_all().execute(updates)   # 128 rows",
      "!num_updated_rows == 0   (no error, no warning)" ] },
    { c: "rg -n 'not_all_null' rust/lance/src/dataset/write/merge_insert.rs", o: [
      "let in_right = Self::not_all_null(combined_batch, right_offset, num_keys)?;",
      "# checks columns [0, num_keys) and assumes the key comes first; here column 0 is vector" ] },
    { c: "git switch fix/merge-insert-key-columns   # find the key columns by name", o: [] },
    { c: "cargo test -p lance merge_insert", o: [
      "+test_repro_3515_partial_schema_fully_indexed (V2_0, V2_1, V2_2) ... ok",
      "+test result: ok. 143 passed" ] }
  ],

  "systemd/systemd#42578": [
    { c: "/usr/lib/systemd/systemd-sysupdate --component=containerd reboot", o: [
      "Newest installed version '2.3.0' is older than booted version '20260527200656'.",
      "!compares a component's version against the host OS version: meaningless" ] },
    { c: "git switch --detach 42578   # fixes #42330", o: [] },
    { c: "/usr/lib/systemd/systemd-sysupdate --component=containerd reboot", o: [
      "+The --component= switch may not be combined with the 'reboot' operation, which only applies to the booted OS version." ] },
    { c: "/usr/lib/systemd/systemd-sysupdate --component=containerd --reboot update", o: [
      "+The --reboot switch may not be combined with --component=, as automatic reboots only apply to the booted OS version." ] },
    { c: "mkosi -f qemu TEST-72-SYSUPDATE", o: [ "+negative regression test passed" ] }
  ],

  "BerriAI/litellm#30387": [
    { c: "python cache_probe.py   # openai/cache-probe via a custom api_base, twice", o: [
      "call 1  cache_creation: 0   cache_read: 0",
      "call 2  cache_creation: 0   cache_read: 0",
      "!OpenAIGPTConfig stripped cache_control from every request" ] },
    { c: "git switch fix/openai-compatible-cache-control   # fixes #30319", o: [
      "# keep cache_control only for provider openai with a non-api.openai.com base" ] },
    { c: "python cache_probe.py", o: [
      "+call 1  cache_creation: non-zero   (cache written)",
      "+call 2  cache_read: non-zero       (cache hit)" ] },
    { c: "grep -c '\"cache_control\"' litellm.log", o: [
      "# present on the system block; real api.openai.com still gets it stripped" ] }
  ]
});

/* Merges the pipeline picked up after the replays above were written. Same
   rule: each follows the reproduction and numbers in its own PR description. */
Object.assign(window.DECK_SIMS, {

  "systemd/systemd#43952": [
    { c: "time systemctl list-dependencies --all | wc -l", o: [
      "96627", "real\t1m3.63s",
      "# ~260 distinct units on a stock Fedora 44 desktop, printed once per path" ] },
    { c: "# the units strv is only the current path, popped on the way back up", o: [
      "!so every repeat of a unit re-asked PID 1: a GetAll() and a Get() over D-Bus" ] },
    { c: "git switch --detach 43952   # cache deps and state per unit, sort each list once", o: [
      "# D-Bus calls now bounded by the distinct units, not the size of the tree" ] },
    { c: "time systemctl list-dependencies --all | wc -l", o: [
      "96627", "+real\t0m0.34s   187x" ] },
    { c: "time systemctl list-dependencies --all sockets.target > /dev/null", o: [
      "+real\t0m0.12s   170x (was 20.45s)" ] },
    { c: "cmp <(systemctl.old list-dependencies --all) <(systemctl list-dependencies --all) && echo identical", o: [
      "+identical   (also --after, --plain, --type=, --state=)" ] }
  ],

  "systemd/systemd#43872": [
    { c: "ls -l /run/systemd/report.files/", o: [
      "bar/", "baz -> /nonexistent", "foo -> /dev/null   # masked, the usual way",
      "# regular files of the same names sit in /var/lib/systemd/report.files/" ] },
    { c: "varlinkctl call $REPORT io.systemd.Metrics.Describe '{}'", o: [
      "io.systemd.Files.bar  io.systemd.Files.baz  io.systemd.Files.foo" ] },
    { c: "varlinkctl call $REPORT io.systemd.Metrics.List '{}'", o: [
      "io.systemd.Files.baz",
      "!Failed to open '/run/systemd/report.files/bar', skipping: Is a directory",
      "!Failed to open '/run/systemd/report.files/foo', skipping: File descriptor in bad state",
      "# the listing skipped them; the lookup walked the dirs itself and stopped there" ] },
    { c: "git switch --detach 43872   # filter masked symlinks, skip -EISDIR/-EBADFD in the lookup", o: [] },
    { c: "varlinkctl call $REPORT io.systemd.Metrics.Describe '{}'", o: [
      "+io.systemd.Files.bar  io.systemd.Files.baz   (foo is masked)" ] },
    { c: "varlinkctl call $REPORT io.systemd.Metrics.List '{}'", o: [
      "+bar = vendor-bar   baz = vendor-baz   (no warnings)" ] },
    { c: "mkosi -f qemu TEST-74-AUX-UTILS", o: [ "+report: masked and non-regular entries covered" ] }
  ],

  "util-linux/util-linux#4663": [
    { c: "fallocate -l 1.7G f && stat -c %s f", o: [
      "2147483648",
      "!2 GiB: digit d at position n counted as 1/floor(10^n/d), so .7 became a whole G" ] },
    { c: "fallocate -l 1.10G f && stat -c %s f", o: [
      "2147483648",
      "!while (frac_div < frac) stops one step early when the digits are 1 then zeros" ] },
    { c: "./tests/run.sh misc/strtosize   # with the new fractional cases", o: [
      "!0.4G -> 512 MiB (want 409.6 MiB)   0.10MiB -> 1 MiB (want 102.4 KiB)",
      "!18.9EB -> 491 PiB (wrapped)        0.5ZiB -> 2^59 (scale error ignored)" ] },
    { c: "git switch fix/strtosize-exact   # fixes #2213", o: [
      "# walk the digits from the last: (digit * frac_base + previous) / 10",
      "# the floors nest, so it is exactly floor(frac_base * 0.<digits>), in 64 bits" ] },
    { c: "fallocate -l 1.7G f && stat -c %s f", o: [ "+1825361100" ] },
    { c: "./tests/run.sh misc/strtosize", o: [
      "+misc: strtosize ... OK   (fails on master)",
      "+18.9EB and 0.5ZiB -> ERANGE",
      "# 4000 random inputs against exact rationals: every result is the exact floor" ] }
  ],

  "util-linux/util-linux#4664": [
    { c: "cal -3 1 1 | head -1", o: [
      "!   December 0000          January 0001          February 0001",
      "# cal rejects years below 1 everywhere else" ] },
    { c: "cal -S -n 26 1 2025 | head -1", o: [
      "!     (null) 2023          January 2023          February 2023",
      "# month 0: full_month[-1] read out of bounds; the span should start at December 2023" ] },
    { c: "git switch fix/cal-span   # fixes #1553", o: [
      "# one month index, year * 12 + month - 1 - num_months / 2, clamped to January 0001",
      "# int64_t, so a large -n or year cannot overflow" ] },
    { c: "cal -3 1 1 | head -1", o: [
      "+    January 0001          February 0001           March 0001" ] },
    { c: "cal -S -n 26 1 2025 | head -1", o: [
      "+   December 2023          January 2024          February 2024" ] },
    { c: "./tests/run.sh cal", o: [
      "+all 11 cal tests passed   (the 3 new subtests fail on master)",
      "# 3528 old-vs-new runs: all 545 differences are one of the two bugs" ] }
  ],

  "storytold/photocraft#629": [
    { c: "ctl document.pixel '{\"x\": 2147483647, \"y\": 0}'", o: [
      "!thread '...' panicked at crates/engine/src/commands.rs:830:92:",
      "!index out of bounds: the len is 0 but the index is 0",
      "# from_xywh(x, y, 1, 1) saturates x + 1 to i32::MAX: an empty rect, no pixels" ] },
    { c: "ctl document.pixel '{\"x\": 4294967296, \"y\": 0}'", o: [
      "!returns the pixel at column 0: `as i32` wrapped 2^32 to 0" ] },
    { c: "git switch fix/document-pixel-limits   # i32::try_from, then .px.first()", o: [] },
    { c: "ctl document.pixel '{\"x\": 2147483647, \"y\": 0}'", o: [
      "+transparent   (like every other off-canvas pixel)" ] },
    { c: "ctl document.pixel '{\"x\": 4294967296, \"y\": 0}'", o: [
      "+BadParams: x must fit in 32 bits" ] },
    { c: "cargo test -p photocraft-engine --lib", o: [
      "+document_pixel_at_the_coordinate_limits ... ok   (panics on main)",
      "+test result: ok. 653 passed" ] }
  ],

  "storytold/photocraft#628": [
    { c: "./bench box-blur 2000x1500 --threads 2 --radius 10,50,150,400", o: [
      "  r=10    132 ms", "  r=50    617 ms", "  r=150   2.54 s", "!  r=400   6.97 s",
      "# a 2r+1 tap kernel along each axis: the cost grows with the radius" ] },
    { c: "rg -n 'fn gaussian_boxes' crates/algo/src/blur.rs", o: [
      "# Gaussian Blur, same file, already uses running-sum boxes: cost independent of radius" ] },
    { c: "git switch perf/box-blur   # share box_passes(), one box of width 2r+1", o: [
      "# radius 1..4 keeps the direct kernel: slightly quicker there, output unchanged" ] },
    { c: "./bench box-blur 2000x1500 --threads 2 --radius 10,50,150,400", o: [
      "+  r=10     50 ms   2.7x", "+  r=50     72 ms   8.6x",
      "+  r=150   192 ms   13x", "+  r=400   269 ms   26x" ] },
    { c: "cargo test -p photocraft-algo", o: [
      "+box_passes_match_the_direct_box_kernel ... ok   (within 1e-5)",
      "# only the summation order changed: no 16-bit sample moves more than one level",
      "+test result: ok. 238 passed" ] }
  ],

  "storytold/photocraft#630": [
    { c: "./bench maximum --preserve squareness 2000x1500 --threads 2 --radius 3,10,50,200", o: [
      "  r=3     141 ms", "  r=10    443 ms", "  r=50    2.80 s", "!  r=200  14.27 s",
      "# every pixel scans all 2r+1 samples, once along rows and once along columns" ] },
    { c: "rg -n 'running_extreme' crates/algo/src/other.rs", o: [
      "# Preserve: Roundness already uses it (van Herk / Gil-Werman, constant per pixel)" ] },
    { c: "git switch perf/min-max-square   # running_extreme for both passes", o: [] },
    { c: "./bench maximum --preserve squareness 2000x1500 --threads 2 --radius 3,10,50,200", o: [
      "  r=3     139 ms   same", "+  r=10    153 ms   2.9x",
      "+  r=50    234 ms   12x", "+  r=200   384 ms   37x" ] },
    { c: "cargo test -p photocraft-algo", o: [
      "+square_min_max_matches_the_direct_window_exactly ... ok   (assert_eq! on f32)",
      "# a min or max is one of the window's samples: bit-identical by construction",
      "+test result: ok. 238 passed" ] }
  ],

  "storytold/photocraft#631": [
    { c: "./bench surface-blur 1000x750 --threads 2 --threshold 15 --radius 5,15,30", o: [
      "  r=5     214 ms", "  r=15    1.48 s", "!  r=30    6.10 s",
      "# the full (2r+1)^2 window per pixel and channel: 40,401 samples at radius 100" ] },
    { c: "git switch perf/surface-blur-histogram", o: [
      "# a weight depends only on the value and the centre: 1 - |v - v0| / t",
      "# so on 8-bit tiles, slide a 256-bin histogram and sum only levels within t" ] },
    { c: "./bench surface-blur 1000x750 --threads 2 --threshold 15 --radius 5,15,30,100", o: [
      "  r=5     229 ms   same (direct sum)", "+  r=15    112 ms   13x",
      "+  r=30    143 ms   43x", "+  r=100   421 ms   ~150x (was ~66 s)" ] },
    { c: "cargo test -p photocraft-algo", o: [
      "+surface_blur_8bit_histogram_matches_the_direct_sum ... ok   (within 1e-5)",
      "# sums per level in f64: at most 0.023% of 8-bit samples move, by one level",
      "+test result: ok. 238 passed" ] }
  ],

  "storytold/photocraft#385": [
    { c: "./bench content-aware-scale 6000x4000 --seams 20 --threads 16", o: [
      "find_seam 85-89 ms   energy 133 ms (full map)   removal: new 384 MB buffer",
      "!319 ms per seam   600 seams ~191 s",
      "# scorecard row P28: 954 s against a 3 s budget (#211)" ] },
    { c: "git switch perf/seam-carving   # part of #211", o: [
      "# energy only changes within one pixel of the removed seam: recompute just that",
      "# shift each row in place, in parallel; reuse the seam search buffers" ] },
    { c: "./bench content-aware-scale 6000x4000 --seams 20 --threads 16", o: [
      "find_seam 10-13 ms   energy 2-5 px per row   removal: in place",
      "+23.6 ms per seam   600 seams in 14.1 s   13x" ] },
    { c: "cargo test -p photocraft-algo", o: [
      "+output_bits_are_pinned ... ok   (FNV hash of 8 carves from the old code)",
      "+test result: ok. 224 passed" ] },
    { c: "# old vs new carve on 4,685 random shapes and the full 24 MP case", o: [
      "+bit-identical, ties still broken in the same order" ] }
  ],

  "storytold/photocraft#387": [
    { c: "ctl edit.contentAwareScale '{\"width\": 5, \"height\": 48}'   # a 1x48 layer", o: [
      "!edit.contentAwareScale failed with an internal error (logged); the document is unchanged",
      "!panicked in write_region: region data length mismatch (192 vs 960)" ] },
    { c: "ctl edit.contentAwareScale '{\"width\": 6, \"height\": 10}'   # a 1x5 layer", o: [
      "!panicked in seam::transpose: index out of range" ] },
    { c: "rg -n 'tw <= 1' crates/algo/src/seam.rs", o: [
      "if tw <= 1 { break; }",
      "# a 1 px wide copy found no seam, so the image came back at its old width" ] },
    { c: "git switch fix/seam-one-pixel   # stop only at width 0", o: [
      "# the last column's right neighbour is itself: duplicating it repeats it exactly" ] },
    { c: "ctl edit.contentAwareScale '{\"width\": 5, \"height\": 48}'   # a 1x48 layer", o: [
      "+5x48   (the column, repeated)" ] },
    { c: "cargo test -p photocraft-algo -p photocraft-engine", o: [
      "+one_pixel_lines_enlarge_by_repeating ... ok",
      "+content_aware_scale_enlarges_a_one_pixel_line ... ok   (panicked before)",
      "# 5,045 random shapes: bit-identical in all 4,595 the old code handled" ] }
  ],

  "storytold/photocraft#384": [
    { c: "wl-copy --type text/uri-list $'file:///home/me/red%20copy.png\\r\\n'   # as GNOME Files does", o: [] },
    { c: "ctl edit.paste", o: [
      "!the clipboard is empty",
      "# file managers copy the path, not pixels; only get_image() was asked" ] },
    { c: "git switch fix/paste-copied-file   # part of #338", o: [
      "# no image? fall back to get().file_list() and take the first file that decodes",
      "# trim the trailing \\r: text/uri-list is CRLF, arboard splits on \\n only" ] },
    { c: "ctl edit.paste", o: [
      "+{\"layer\": 3, \"offset\": [80, 30]}   # 40x40, centred in a 200x100 document" ] },
    { c: "cargo test -p photocraft --bin photocraft", o: [
      "+non-images skipped after a 256-byte header; a truncated PNG is skipped, not a panic",
      "+test result: ok. 40 passed" ] }
  ]
});
