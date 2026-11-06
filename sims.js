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

/* Replays for the Spotifast and PhotoCraft merges of 8 to 13 October. */
Object.assign(window.DECK_SIMS, {

  "crmne/spotifast#777": [
    { c: "cargo run --release --example load_liked -- --songs 5000 10000 20000", o: [
      "  5,000   model 0.22 s   page shown, sorted by title 0.47 s",
      "  10,000  model 0.95 s   page shown, sorted by title 1.89 s",
      "!  20,000  model 3.95 s   page shown, sorted by title 7.54 s",
      "# sync_view cloned and deep-compared the whole list for every 50-song page,",
      "# then the table rebuilt a row for every song: ~400 times at 20k" ] },
    { c: "git switch perf/liked-songs-append", o: [
      "# remember what sync_view last made of the view; if only a page landed at the end",
      "# and no pending like or unlike touches it, append. Anything else: full rebuild" ] },
    { c: "cargo run --release --example load_liked -- --songs 5000 10000 20000", o: [
      "+  5,000   model 0.035 s   page shown 0.10 s",
      "+  10,000  model 0.12 s    page shown 0.31 s",
      "+  20,000  model 0.44 s    page shown 1.10 s   (was 7.54 s)" ] },
    { c: "cargo test appended_pages_show_what_a_full_sync_shows liked_rows_added_page_by_page", o: [
      "+appended_pages_show_what_a_full_sync_shows ... ok   (view == full rebuild after every step)",
      "+liked_rows_added_page_by_page_match_rows_made_at_once ... ok",
      "# both fail if either guard is removed" ] }
  ],

  "crmne/spotifast#778": [
    { c: "cargo run --release --example recordings -- --liked 20000 --page 50", o: [
      "remember_track_recording, 50-track page after 20k liked songs:",
      "!46.7 ms   walked every URI in `saved`, looked each up in track_recordings",
      "# set_saved_state and saved_toggle_targets did the same scan" ] },
    { c: "git switch perf/recording-index   # keep the reverse of track_recordings", o: [
      "# recording key -> its URIs, kept in step through one helper;",
      "# ask the recording's own few URIs, still read the live `saved` map" ] },
    { c: "cargo run --release --example recordings -- --liked 20000 --page 50", o: [
      "+0.04 ms   (was 46.7 ms)",
      "+loading 20k liked songs: 13.6 s -> 4.1 s   (0.47 s together with #777)" ] },
    { c: "cargo test a_recording_follows_its_uris_when_they_move_or_change", o: [
      "+a_recording_follows_its_uris_when_they_move_or_change ... ok",
      "# a URI moving recording, unliking the last URI, a direct write to `saved`, sign-out reset" ] }
  ],

  "storytold/photocraft#901": [
    { c: "./bench median 1920x1280 --depth 8 --radius 2,8,32", o: [
      "  r=2    0.70 s", "  r=8    3.73 s", "!  r=32   47.8 s",
      "# every sample of a disc (~pi r^2) gathered and selected per pixel and channel:",
      "# each doubling of the radius is ~4x the work" ] },
    { c: "git switch perf/median-histogram   # fixes #498", o: [
      "# replace samples with their rank among the window's distinct values (total_cmp order)",
      "# move a rank histogram in a serpentine over the tile: O(radius) per pixel (Huang)" ] },
    { c: "./bench median 1920x1280 --depth 8,16,32 --radius 32", o: [
      "+ 8-bit   0.84 s   57x",
      "+16-bit   1.09 s   44x",
      "+32-bit   1.34 s   36x",
      "# output hashes identical to main in every row" ] },
    { c: "cargo test -p photocraft-algo median_histogram_matches_the_direct_selection", o: [
      "+ok: median_ranked == median_direct, bit for bit, radii 2, 3, 7, 16",
      "# 8-bit ties, 16-bit levels, floats with -0.0, out-of-range values and a NaN",
      "+test result: ok. 262 passed" ] }
  ],

  "storytold/photocraft#902": [
    { c: "./bench motion-blur 2000x1500 --angle 0 --distance 10,2000", o: [
      "  d=10     0.233 s",
      "!  d=2000   130 s",
      "# distance + 1 bilinear samples per pixel, each through Image::sample,",
      "# which checks the edge policy on all four taps" ] },
    { c: "git switch perf/motion-blur-kernel", o: [
      "# offsets and bilinear weights are the same for every pixel: merge the taps once per tile",
      "# premultiply the window once, then row[x] += w * window[x + dx, y + dy] over whole rows" ] },
    { c: "./bench motion-blur 2000x1500 --angle 0 --distance 10,2000", o: [
      "+  d=10     0.039 s   6x",
      "+  d=2000   1.83 s    71x   (was 130 s)" ] },
    { c: "./bench motion-blur --compare-main --angle 30 --distance 100", o: [
      "# not bit-identical: the f32 sums are added in a different order",
      "+0.0037% of 8-bit samples differ, largest difference 1 level" ] },
    { c: "cargo test -p photocraft-algo motion_kernel_matches_the_per_pixel_samples", o: [
      "+ok: within 1e-5 of average_samples, seven angle/distance pairs, with and without alpha",
      "+test result: ok. 262 passed" ] }
  ]
});

Object.assign(window.DECK_SIMS, {

  "systemd/systemd#43953": [
    { c: "./build/test-journal-verify --make /tmp/j.journal && flip-offset /tmp/j.journal data.next_hash_offset --to-self", o: [
      "# one data object's next_hash_offset now points at the object itself" ] },
    { c: "timeout 60 journalctl --file=/tmp/j.journal --verify", o: [
      "!(still running at 100% CPU when killed after 60 s)",
      "# every walker that follows hash chains trusts the link; nothing checked it on read" ] },
    { c: "timeout 10 journalctl --file=/tmp/j.journal -F MESSAGE | head -3", o: [
      "!hello", "!hello", "!hello",
      "# a data object whose next_field_offset points at itself: the same value, forever" ] },
    { c: "git switch --detach 43953   # reject links that loop back, in check_object()", o: [
      "# objects are only appended: a valid next_hash_offset is 0 or past the object's own offset,",
      "# and next_field_offset (new data is prepended to its field) is always below it" ] },
    { c: "journalctl --file=/tmp/j.journal --verify", o: [
      "+reported as corrupted straight away: the object is refused with EBADMSG, not looped on" ] },
    { c: "meson test -C build test-journal-verify", o: [
      "+4 new cases: hash chain loop, field loop, self-pointing field list, archive punch-holes",
      "# each hangs or fails without the fix",
      "+journalctl --verify, --fields and -F unchanged on real journals" ] }
  ]
});

/* Replays for the merges of mid-October to early November, and for the
   published security advisories (keyed by GHSA ID). Same rule as above:
   each follows the reproduction and numbers in its own description. */
Object.assign(window.DECK_SIMS, {

  "GHSA-3jpq-xwf3-rwr6": [
    { c: "zig build -Doptimize=ReleaseFast   # v1.0.1: release builds strip assertions", o: [] },
    { c: "printf '<svg><%s></svg>' \"$(head -c 1050 /dev/zero | tr '\\0' a)\" > long-tag.html", o: [
      "# no script needed: the parser takes the SVG path while it builds the DOM" ] },
    { c: "./zig-out/bin/lightpanda fetch --dump file://$PWD/long-tag.html", o: [
      "!Segmentation fault (core dumped)" ] },
    { c: "# std.ascii.lowerString(&frame.buf, name): a 1,024-byte buffer, a 1,050-byte name", o: [
      "# the only length check was a std.debug.assert inside lowerString",
      "!the overflow rewrites frame.js and the page and call arena pointers that follow buf" ] },
    { c: "cdp Runtime.evaluate \"document.createElement('a'.repeat(1050))\"   # lightpanda serve", o: [
      "!connection closed: the server process died, every other CDP session with it" ] },
    { c: "git switch --detach 1.0.2   # the patched release", o: [] },
    { c: "./zig-out/bin/lightpanda fetch --dump file://$PWD/long-tag.html > /dev/null; echo $?", o: [
      "+0   (no SEGV)" ] },
    { c: "cdp Runtime.evaluate \"document.createElement('a'.repeat(1050))\"", o: [
      "+server still up; the other sessions never notice" ] }
  ],

  "util-linux/util-linux#4727": [
    { c: "time column -t --tree-id 1 --tree-parent 2 --tree 3 tree-30k.txt > /dev/null", o: [
      "real\t0m6.29s",
      "# 100,000 lines: ~205 s. quadratic in the number of lines" ] },
    { c: "# two causes", o: [
      "!create_tree() scans every line for each ID to find its children",
      "!each cell reset memsets the whole print buffer, which grows with the lines" ] },
    { c: "git switch perf/column-tree   # clear only the used part; sort once, binary search", o: [] },
    { c: "time column -t --tree-id 1 --tree-parent 2 --tree 3 tree-30k.txt > /dev/null", o: [
      "+real\t0m0.06s   ~100x",
      "+100,000 lines: 0.31 s" ] },
    { c: "./compare-old-new.sh trees stars chains dup-ids missing-parents -J -o -c -R -N", o: [
      "+identical output and exit codes; tests/run.sh column passes" ] }
  ],

  "AcademySoftwareFoundation/openexr#2802": [
    { c: "cmake -B build -DCMAKE_C_FLAGS=-fsanitize=undefined && cmake --build build", o: [] },
    { c: "./harness --user-pixel-stride 3 half.exr   # a packed float+short struct", o: [
      "!unpack.c:993:21: runtime error: store to misaligned address for type 'uint16_t'",
      "!(also lines 534, 536, 538, 916, 918, 920, 922 and 1068)",
      "# #2763 fixed the deep paths; the flat fast paths had the same stores" ] },
    { c: "git switch fix/flat-unaligned-stores   # store_native16 / store_native32", o: [] },
    { c: "./harness --user-pixel-stride 3 half.exr && ./harness --user-pixel-stride 6 float.exr", o: [
      "+clean under UBSan",
      "+decoded values unchanged: 1/3/4-channel half, 1/2-channel float and uint" ] }
  ],

  "systemd/systemd#43762": [
    { c: "./build/bench-umount --below /tmp/p --mounts 600 --unrelated 600", o: [
      "!umount_recursive_full(): 538.2 ms",
      "# it breaks out after the first umount2() and re-parses all of /proc/self/mountinfo" ] },
    { c: "git switch --detach 43762   # one pass per snapshot, re-parse only on progress", o: [
      "# each path is checked against the snapshot's mount ID first, so a stale path",
      "# can't follow a symlink out of the prefix or onto the keep list" ] },
    { c: "./build/bench-umount --below /tmp/p --mounts 100,300,600 --unrelated =", o: [
      "+100 mounts    1.6 ms   (was 20.0 ms)",
      "+300 mounts    4.0 ms   (was 145.1 ms)",
      "+600 mounts    8.0 ms   (was 538.2 ms)" ] },
    { c: "unshare -Urm ./build/test-mount-util", o: [
      "+all tests passed   (the new mount-ID check test fails without it)" ] }
  ],

  "fwupd/fwupd#11324": [
    { c: "fwupdtool firmware-parse s2.srec srec | grep addr   # S205123456AAB4", o: [
      "!addr 0x3456",
      "# fu_firmware_strparse_uint24_safe() cast its result to guint16" ] },
    { c: "git switch fix/srec-uint24   # keep all 24 bits", o: [] },
    { c: "fwupdtool firmware-parse s2.srec srec | grep addr", o: [ "+addr 0x123456" ] },
    { c: "meson test -C build fwupd-self-test", o: [
      "+S2 record tokenization ... OK   (fails before)", "+all tests passed" ] }
  ],

  "fwupd/fwupd#11325": [
    { c: "cat gap.hex", o: [ ":01000000AA55", ":01000400BB40", ":00000001FF" ] },
    { c: "fwupdtool firmware-parse gap.hex ihex | xxd", o: [
      "!aa bb   (2 bytes: the gap was never padded)",
      "# addr_last > 0 meant \"have data\", but after a 1-byte record at 0 it is still 0" ] },
    { c: "git switch fix/ihex-pad-after-zero   # a got_data flag instead", o: [] },
    { c: "fwupdtool firmware-parse gap.hex ihex | xxd", o: [ "+aa 00 00 00 bb   (5 bytes)" ] },
    { c: "meson test -C build fwupd-self-test", o: [ "+new ihex case fails before, all tests pass after" ] }
  ],

  "lsof-org/lsof#376": [
    { c: "lsof -iUDP -sUDP:ESTABLISHED   # one connected, one unconnected UDP socket", o: [
      "nc  4242 me  3u IPv4  UDP 127.0.0.1:38535->127.0.0.1:9",
      "!nc  4243 me  3u IPv4  UDP *:41000   (should have been filtered out)",
      "# every record was checked against the TCP state tables, even UDP ones" ] },
    { c: "git switch fix/udp-state-filter   # pick the tables by protocol", o: [] },
    { c: "lsof -iUDP -sUDP:ESTABLISHED", o: [
      "+nc  4242 me  3u IPv4  UDP 127.0.0.1:38535->127.0.0.1:9 (ESTABLISHED)" ] },
    { c: "make check", o: [
      "+case-20-udp-socket-state ... ok   (covers ^ESTABLISHED; fails before)" ] }
  ],

  "lsof-org/lsof#377": [
    { c: "lsof -u ,99999 | awk '$3 == \"root\"' | wc -l", o: [
      "!1352",
      "# the empty first entry went through enter_uid() with nothing parsed: uid 0" ] },
    { c: "git switch fix/u-empty-entry", o: [] },
    { c: "lsof -u ,99999", o: [ "+lsof: empty -u UID or login name: ,99999" ] },
    { c: "make check", o: [ "+case-20-uid-empty-entry ... ok   (also a lone -u ^)" ] }
  ],

  "OpenPrinting/cups-filters#790": [
    { c: "tail -1 unclosed.ppd", o: [ "*FoomaticRIPCommandLine: \"gs -q -dBATCH" ] },
    { c: "timeout 10 foomatic-rip --ppd unclosed.ppd < job.ps", o: [
      "!(hangs, memory climbing; killed by timeout)",
      "# the continuation loop never checked fgets(): it re-appended the last line forever" ] },
    { c: "foomatic-rip --ppd bad-hex.ppd < job.ps | head -c 60   # *JCLBegin: \"<1B>%-12345X<ZZ>\"", o: [
      "!Error replacing hex notation in <1B>%-12345X<ZZ>!   (in the data sent to the printer)" ] },
    { c: "git switch fix/ppd-eof-unhexify-log", o: [] },
    { c: "foomatic-rip --ppd unclosed.ppd < job.ps", o: [
      "+Invalid line: \"FoomaticRIPCommandLine: ...\"   (rejected, no hang)" ] },
    { c: "foomatic-rip --ppd bad-hex.ppd < job.ps 2>&1 >/dev/null | head -1", o: [
      "+Error replacing hex notation in <1B>%-12345X<ZZ>!   (stderr: the log, not the printer)" ] }
  ],

  "OpenPrinting/libppd#102": [
    { c: "./harness filter-streaming-mode on off yes no true false", o: [
      "!on     0   (treated as off)", "off    0", "yes    1", "no     0", "true   1", "false  0",
      "# strcasecmp(\"on\",\"off\") & strcasecmp(\"on\",\"no\") is 8 & 1 == 0 with glibc" ] },
    { c: "git switch fix/streaming-mode-and   # & -> &&", o: [] },
    { c: "./harness filter-streaming-mode on off yes no true false", o: [
      "+on     1", "off    0", "yes    1", "no     0", "true   1", "false  0" ] }
  ],

  "OpenPrinting/libcupsfilters#318": [
    { c: "./harness zoom 3x3.img --xsize -3 --ysize -3   # pixels 1..9", o: [
      "bilinear  9 8 7  6 5 4  3 2 1",
      "!nearest   3 2 1  6 5 4  9 8 7   (mirrored, not turned)",
      "# zoom_nearest() tested yflip < 0, but it is only ever 0 or 1" ] },
    { c: "git switch fix/zoom-nearest-yflip", o: [] },
    { c: "./harness zoom 3x3.img --xsize -3 --ysize -3", o: [
      "bilinear  9 8 7  6 5 4  3 2 1",
      "+nearest   9 8 7  6 5 4  3 2 1",
      "# so 1/2/4-bit imagetoraster output at orientation 5 or 6 turns 180 degrees again" ] }
  ],

  "OpenPrinting/libcupsfilters#314": [
    { c: "./harness options 'overrides={page-numbers=1-2 orientation-requests=4},{page-numbers=3}'", o: [
      "!(hangs, memory climbing)   # built against CUPS 2.4.19",
      "# since ff7392c8 the 2.4 cupsParseOptions macro dropped the end pointer" ] },
    { c: "git switch fix/overrides-cups-2.4", o: [
      "# on 2.4, find each {...} value's end and hand only that piece to the parser" ] },
    { c: "ASAN_OPTIONS=detect_leaks=1 ./harness options 'overrides={...},{page-numbers=3}'", o: [
      "+2 overrides: pages 1-2 orient 4 / pages 3-3",
      "+no ASan report   (the array had been storing a pointer to a stack variable)" ] }
  ],

  "OpenPrinting/cups-browsed#80": [
    { c: "./harness conf 'Cluster office'", o: [
      "!cluster office members=0:",
      "# the documented default member was passed as ptr2 right after ptr2 = NULL" ] },
    { c: "./harness conf 'Cluster lab: hp1 hp2' 'Cluster :x'", o: [
      "!==ERROR: AddressSanitizer: heap-use-after-free",
      "# a broken line's goto ..._fail freed the previous line's entry" ] },
    { c: "git switch fix/conf-cluster-frees-interval", o: [
      "# also: BrowseInterval 0 made browse_poll() re-arm itself in a busy loop" ] },
    { c: "./harness conf 'Cluster office'", o: [ "+cluster office members=1: office" ] },
    { c: "./harness conf 'Cluster lab: hp1 hp2' 'Cluster :x'", o: [
      "+cluster lab members=2: hp1 hp2   (no ASan report)" ] },
    { c: "# BrowseInterval 0 needs a BrowsePoll server: checked by reading the code", o: [
      "+BrowseInterval must now be positive; BrowseTimeout 0 still accepted" ] }
  ],

  "OpenPrinting/libppd#101": [
    { c: "./harness pdftopdf-comments '%%PDFTOPDFNumCopies 3'", o: [
      "!SEGV on unknown address 0x000000000001",
      "# strchr(line, ':') + 1 with no colon on the line" ] },
    { c: "./harness pdftopdf-comments '%%PDFTOPDFNumCopies:'   # at EOF, no value", o: [
      "!stack-buffer-overflow, reads before deviceCopies" ] },
    { c: "git switch fix/pdftopdf-comment-colon", o: [] },
    { c: "./harness pdftopdf-comments '%%PDFTOPDFNumCopies 3' '%%PDFTOPDFCollate' '%%PDFTOPDFNumCopies:'", o: [
      "+applied=0 copies=[1]", "+applied=0 copies=[1]", "+applied=1 copies=[1]" ] },
    { c: "./harness pdftopdf-comments '%%PDFTOPDFNumCopies: 4' '%%PDFTOPDFCollate: true'", o: [
      "applied=1 copies=[4] collate=1   # well-formed comments unchanged" ] }
  ],

  "OpenPrinting/cups-filters#789": [
    { c: "TMPDIR=\"/tmp/a b'c)\" foomatic-rip -o 'Tone=Light 2:Tone=Dark' 3pages.pdf", o: [
      "!sh: -c: line 1: syntax error near unexpected token `)'",
      "!Unable to determine number of pages, page count: -1",
      "# the gs helpers ran through popen(): TMPDIR went through a shell and into PostScript" ] },
    { c: "cd job && TMPDIR='|touch PWNED;:' foomatic-rip ... && ls PWNED", o: [
      "!PWNED" ] },
    { c: "git switch fix/gs-no-shell   # follow-up to #788: fork+exec gs with an argv", o: [
      "# PDF name passed as a string parameter; ./ before relative names, % doubled" ] },
    { c: "TMPDIR=\"/tmp/a b'c)\" foomatic-rip -o 'Tone=Light 2:Tone=Dark' 3pages.pdf", o: [
      "+light: page 1 / dark: page 2 / light: page 3" ] },
    { c: "cd job && TMPDIR='|touch PWNED;:' foomatic-rip ... && ls PWNED", o: [
      "+ls: cannot access 'PWNED': No such file or directory" ] }
  ],

  "OpenPrinting/cups-filters#788": [
    { c: "foomatic-rip --ppd tone.ppd -o 'Tone=Light 2:Tone=Dark' 3pages.pdf   # non-gs renderer", o: [
      "!gs: Invalid value for option -dNOMEDIAATTRS-sDEVICE=pdfwrite",
      "!/tmp/foomatic-O0Dtpk: No such file or directory" ] },
    { c: "foomatic-rip --ppd tone-gs.ppd -o 'Tone=Light 2:Tone=Dark' 3pages.pdf", o: [
      "!dark: pages 1-3, then dark: pages 2-3 again" ] },
    { c: "# four bugs together", o: [
      "# rendered through page i with page i's options; options never reset per page;",
      "# ranges from page 1 printed it all; a missing space emptied the extract" ] },
    { c: "git switch fix/pdf-page-options", o: [] },
    { c: "foomatic-rip --ppd tone.ppd -o 'Tone=Light 2:Tone=Dark' 3pages.pdf", o: [
      "+light: page 1 / dark: page 2 / light: page 3   (both renderer paths)" ] }
  ],

  "fwupd/fwupd#11309": [
    { c: "./harness strsplit-full 'abc' --size 1 --delim '\\r\\n'", o: [
      "![\"abc\"]   (delimiter longer than the buffer: copied the whole string)" ] },
    { c: "./harness strsplit-full 'a\\r\\n' --size 2 --delim '\\r\\n'", o: [
      "![\"a\"]     (matched a delimiter running past the end)",
      "# fu_strsplit_bytes() buffers aren't NUL terminated, e.g. modem responses" ] },
    { c: "git switch fix/strsplit-full-size", o: [] },
    { c: "./harness strsplit-full 'abc' --size 1 --delim '\\r\\n' && ./harness strsplit-full 'a\\r\\n' --size 2 --delim '\\r\\n'", o: [
      "+[\"a\"]", "+[\"a\\r\"]" ] },
    { c: "meson test -C build fwupd-self-test", o: [ "+strnsplit cases fail before, all string tests pass" ] }
  ],

  "fwupd/fwupd#11310": [
    { c: "./harness strstrip $'\\tfoo'", o: [ "!\"\\tfoo\"   (only spaces skipped at the start)" ] },
    { c: "./harness strstrip $'  \\n'", o: [
      "!g_strndup() asks for about 4 GiB",
      "# the end was found before the start, so the length wrapped around" ] },
    { c: "git switch fix/strstrip-leading-ws   # all whitespace, both ends", o: [] },
    { c: "./harness strstrip $'\\tfoo' $'  \\n'", o: [ "+\"foo\"", "+\"\"" ] }
  ],

  "util-linux/util-linux#4690": [
    { c: "cat /etc/os-release   # no trailing newline", o: [
      "NAME=Fedora", "VERSION=", "ANSI_COLOR=", "PRETTY_NAME=\"Fedora Linux 44\"", "X==y", "ID=fedora" ] },
    { c: "agetty --show-issue   # issue: VERSION=[\\S{VERSION}] ANSI=[\\S{ANSI_COLOR}] X=[\\S{X}] ID=[\\S{ID}]", o: [
      "!VERSION=[ANSI_COLOR=] ANSI=[^[[PRETTY_NAME=\"Fedora Linux 44m] X=[y] ID=[fedora]",
      "# an empty value took the next line; X==y lost an =" ] },
    { c: "ASAN_OPTIONS=halt_on_error=1 agetty --show-issue   # NAME=Fedora\\nID=fedora, \\S{ID}", o: [
      "!heap-buffer-overflow READ of size 1   (eol + 1 is past the NUL)" ] },
    { c: "git switch fix/agetty-os-release   # one line at a time, since b34f097e7 (v2.24)", o: [] },
    { c: "agetty --show-issue", o: [
      "+VERSION=[] ANSI=[^[[m] X=[=y] ID=[fedora]",
      "# 4.2M random cases vs a separate parser: 0 ASan reports, 0 mismatches" ] }
  ],

  "OpenPrinting/cups-browsed#79": [
    { c: "./harness browse-allow 0.0.0.0/0", o: [
      "!runtime error: shift exponent 32 is too large for 32-bit type 'unsigned int'",
      "!mask=255.255.255.255   (allow-all became allow-one)" ] },
    { c: "git switch fix/browseallow-linklocal-overwritten", o: [
      "# also: addrstr[6] == 'B' tested twice, so feb* link-local missed its interface",
      "# also: queue_overwritten() turned a changed device URI into \"PPD only\"" ] },
    { c: "./harness browse-allow 0.0.0.0/0 10.0.0.0/8 192.168.1.0/24", o: [
      "+mask=0.0.0.0", "mask=255.0.0.0", "mask=255.255.255.0" ] }
  ],

  "OpenPrinting/cups-browsed#78": [
    { c: "./harness local-queue-name 'Office Printer' --existing Office_Printer   # IPP, defaults", o: [
      "!Office_Printer@printer.local",
      "# tested the is_cups_queue pointer, not what it points to: always true" ] },
    { c: "git switch fix/is-cups-queue-deref", o: [
      "# name@host is meant only for when DNS-SD naming isn't used" ] },
    { c: "./harness local-queue-name 'Office Printer' --existing Office_Printer", o: [
      "+(ignored) No suitable local queue name found" ] },
    { c: "./harness local-queue-name 'Free One'", o: [ "Free_One   # unchanged" ] }
  ],

  "OpenPrinting/cups-filters#786": [
    { c: "./harness dstrncat \"$(printf '(A\\0B) show\\n')\" | xxd -p", o: [
      "!2841000000000000000000",
      "# dstrncat() stopped at the first NUL and zero-filled the rest of the line" ] },
    { c: "# print_ps() re-feeds from that copy: binary image data in PostScript corrupted", o: [] },
    { c: "git switch fix/dstrncat-memcpy", o: [] },
    { c: "./harness dstrncat \"$(printf '(A\\0B) show\\n')\" | xxd -p", o: [ "+28410042292073686f770a" ] }
  ],

  "OpenPrinting/libppd#98": [
    { c: "rg -n 'cfNewResolution' ppd/ppd-generator.c", o: [
      "!current_def == cfNewResolution(...)   # a pointer compare with a fresh allocation",
      "!resArray[i] where [j] was meant, and a leak on every pass" ] },
    { c: "./harness gen-ppd urf-supported=RS300-600-1200 printer-resolution-default=1200dpi", o: [
      "*DefaultResolution: 600dpi   # the check could never match: always the middle one" ] },
    { c: "git switch fix/urf-default-res   # keep the middle resolution, drop the loop", o: [
      "# printer-resolution-default is about the engine, not the raster data" ] },
    { c: "./test_ppd_generator", o: [
      "+*DefaultResolution: 600dpi   (pinned by a new case)",
      "# same PPD as before; only the leak is gone" ] }
  ],

  "OpenPrinting/libppd#97": [
    { c: "./harness pdftops --make-model 'Hewlett-Packard LaserJet 4000'", o: [
      "!Printer make and model: HP",
      "# strncpy(make, \"HP\", sizeof(make)) zeroed the buffer the model points into" ] },
    { c: "./harness pdftops --ppd no-product.ppd", o: [
      "!SEGV on address 0x1 in snprintf, from pdftops.c:462   (ppd->product + 1)" ] },
    { c: "git switch fix/pdftops-make-model", o: [] },
    { c: "./harness pdftops --make-model 'Hewlett-Packard LaserJet 4000'", o: [
      "+Printer make and model: HP LaserJet 4000   (the HP quirks match again)" ] },
    { c: "./harness pdftops --ppd no-product.ppd && ./harness pdftops --ppd empty-product.ppd", o: [
      "+Printer make and model: (empty)", "+Printer make and model: (empty)" ] }
  ],

  "lsof-org/lsof#375": [
    { c: "lsof -r1c2 -a -p $$ -Fp", o: [
      "!=======", "!=======   (two repeats, nothing in them)",
      "# after c<N> the code rewound and parsed c2 again as -c 2" ] },
    { c: "git switch fix/r-count-reparse   # stop when the argument is used up", o: [] },
    { c: "lsof -r1c2 -a -p $$ -Fp", o: [ "+p31337", "=======", "+p31337", "=======" ] },
    { c: "make check", o: [ "+case-20-repeat-count ... ok   (now checks the process is listed)" ] }
  ],

  "OpenPrinting/libcupsfilters#313": [
    { c: "./test-ieee1284-normalize 'MFG:HP;MDL:DeskJet'   # no trailing ;", o: [
      "!MFG only -> Unknown",
      "# the parser hit the end while reading the value and broke out before storing it" ] },
    { c: "git switch fix/ieee1284-last-field", o: [] },
    { c: "./test-ieee1284-normalize 'MFG:HP;MDL:DeskJet' 'MFG:HP;MDL:DeskJet;'", o: [
      "+MFG, MDL -> HP DeskJet", "MFG, MDL -> HP DeskJet", "+passed under ASan and UBSan" ] }
  ],

  "OpenPrinting/libcupsfilters#312": [
    { c: "./test-ieee1284-normalize 'Epson Stylus Photo' 'Konica Minolta bizhub C258' 'Kyocera Mita FS-1020D'", o: [
      "!Photo", "!C258", "!Mita FS-1020D",
      "# strncasecmp() without !: the two-word make check fired on a mismatch" ] },
    { c: "git switch fix/ieee1284-two-word-makes   # four missing !s", o: [] },
    { c: "./test-ieee1284-normalize 'Epson Stylus Photo' 'Konica Minolta bizhub C258' 'Kyocera Mita FS-1020D'", o: [
      "+Stylus Photo", "+bizhub C258", "+FS-1020D" ] }
  ],

  "lance-format/lance#6975": [
    { c: "# DirectoryNamespace had no rename_table (#6960)", o: [] },
    { c: "git switch feat/namespace-dir-rename   # part of #6960", o: [
      "# one conflict-aware manifest rewrite: the row moves, its location stays",
      "# no table data copied, moved or deleted" ] },
    { c: "python -c \"ns.rename_table(...); print(ns.describe_table(id=['t2']).location)\"", o: [
      "+.../t1.lance   (same location, metadata and base objects)" ] },
    { c: "python -c \"ns.rename_table(...)\"   # root table, directory-listing mode", o: [
      "+Unsupported (before any mutation: an old directory name would stay visible)" ] },
    { c: "cargo test --profile ci -p lance-namespace-impls --lib", o: [ "+test result: ok. 467 passed" ] }
  ],

  "python/cpython#159504": [
    { c: "./python bench_write.py   # 48 MiB bytes write behind a 2 MiB prefix, socketpair", o: [
      "!1633 ms",
      "# each partial send re-queued b[nbytes:], copying the rest every time: O(n**2)" ] },
    { c: "git switch --detach gh-159503   # wrap the remainder in a memoryview", o: [
      "# the same thing write() already does on its first-send path" ] },
    { c: "./python bench_write.py", o: [ "+14 ms   ~117x" ] },
    { c: "./python -m test test_asyncio", o: [
      "+== Tests result: SUCCESS ==",
      "# 1200 scripted-socket runs, old vs new: identical output" ] }
  ],

  "OpenPrinting/libcupsfilters#305": [
    { c: "/usr/bin/time -f '%M KB' ./harness image-open huge-1bit.png   # 16384x131072, 261 KB", o: [
      "max_ics 32768",
      "!2109440 KB   (every tile kept in memory)",
      "# max_tiles * 256 * 256 * depth hit exactly 2 GB and wrapped to a negative int" ] },
    { c: "git switch fix/tile-cache-limit   # compare in tiles, not bytes", o: [] },
    { c: "/usr/bin/time -f '%M KB' ./harness image-open huge-1bit.png", o: [
      "max_ics 513", "+44032 KB   (the 32 MB cap applies again)" ] }
  ],

  "OpenPrinting/libcupsfilters#306": [
    { c: "./test-pdf LiberationSansNarrow-Regular.ttf   # UBSan build", o: [
      "!sfnt-private.h:61:34: runtime error: left shift of 167 by 24 places cannot be represented in type 'int'",
      "# also the glyph mask loops, once a font has more than 31 glyphs" ] },
    { c: "git switch fix/fontembed-unsigned-shifts   # and NULL-check logfunc in raster", o: [] },
    { c: "./test-pdf LiberationSansNarrow-Regular.ttf && ./test-pdf LiberationSans-Bold.ttf", o: [
      "+no UBSan reports",
      "# the PDF matches master except for the random subset name" ] }
  ],

  "OpenPrinting/libcupsfilters#303": [
    { c: "echo hello | texttopdf 1 me t 1 '' > /dev/null   # ASan build", o: [
      "!==ERROR: AddressSanitizer: heap-buffer-overflow READ of size 3",
      "# the tail copy took ret - length bytes: the padding, not what was left" ] },
    { c: "./harness otf-checksum --lengths 1..12", o: [
      "!len 1: reads 2 past the end   len 3, 7, 11: wrong checksum" ] },
    { c: "git switch fix/otf-checksum-tail   # copy length - (ret - 4) bytes", o: [] },
    { c: "./harness otf-checksum --lengths 1..12", o: [ "+all 12 lengths match, no ASan report" ] }
  ],

  "systemd/systemd#43954": [
    { c: "time journalctl --verify > /dev/null   # 100 files, 772 MB", o: [ "real\t0m13.4s" ] },
    { c: "# where it went", o: [
      "!verify_data() bisected the main entry array for a lookup that could never fail",
      "!every bisection step of the offset lists went through the mmap cache",
      "!a 20-item chain cache against 20+ chains per entry: every lookup missed" ] },
    { c: "git switch --detach 43954   # three commits, each removes work", o: [] },
    { c: "time journalctl --verify > /dev/null", o: [
      "+real\t0m5.1s   2.65x",
      "# 11.0s after the first commit, 8.2s after the second" ] },
    { c: "./build/verify-bitflip-diff --all-bits   # main vs branch", o: [
      "+9,463,104 single-bit corruptions: the two agree on every one" ] }
  ],

  "ppp-project/ppp#652": [
    { c: "# /etc/ppp/eaptls-client is group-readable, so it fails the access check", o: [
      "!have_eaptls_secret_client() opened it without ppp_check_access(): EAP looks usable",
      "# the real read in get_eaptls_secret() does check, so EAP-TLS fails later" ] },
    { c: "rg -n 'ppp_check_access' pppd/auth.c", o: [
      "# the server side and every other secrets lookup in auth.c already check" ] },
    { c: "git switch fix/eaptls-client-access", o: [] },
    { c: "# found in an AI-assisted code review; checked by reading the code", o: [
      "+client and server agree: a file that fails the check never offers EAP" ] }
  ],

  "fwupd/fwupd#11248": [
    { c: "./harness strsafe --guard-page 'ABCD' --limit G_MAXSIZE   # unterminated payload", o: [
      "!SIGSEGV: read past the end of the attribute",
      "# mnl_attr_get_str() + G_MAXSIZE trusts the attribute to be NUL-terminated" ] },
    { c: "git switch fix/devlink-attr-len   # bound by mnl_attr_get_payload_len()", o: [
      "# an entry with no usable name or value is skipped, not looked up as NULL" ] },
    { c: "./harness strsafe --guard-page 'ABCD' --limit payload_len", o: [ "+\"ABCD\"" ] }
  ],

  "ppp-project/ppp#648": [
    { c: "./relay-id-test   # the PADO dump code, lifted out, 24-byte relay ID", o: [
      "!Relay-ID:",
      "# printf(ptr, \" %02x\", ...) instead of sprintf: an empty format, since 2021" ] },
    { c: "git switch fix/pppoe-relay-id-log", o: [] },
    { c: "./relay-id-test", o: [
      "+Relay-ID: a0 a1 a2 a3 a4 a5 a6 a7 a8 a9 aa ab ac ad ae af b0 b1 b2 b3..." ] }
  ],

  "ppp-project/ppp#647": [
    { c: "printf 'alice\\nsecret-from-file\\n' > ua && chmod 600 ua && pppd +ua ua dryrun   # test build", o: [
      "!TEST +ua: user=[alice] passwd=[]",
      "# override_value(\"passwd\", ...) but the option is named password, since 2001" ] },
    { c: "git switch fix/ua-password   # one word", o: [] },
    { c: "pppd +ua ua dryrun", o: [ "+TEST +ua: user=[alice] passwd=[secret-from-file]" ] }
  ],

  "sudo-project/sudo#575": [
    { c: "cvtsudoers -i ldif -f sudoers roles.ldif   # Alice: /usr/bin/id, alice: /bin/sh", o: [
      "# sudoRole role1, role2",
      "!Alice ALL = /usr/bin/id, /bin/sh",
      "# Alice gains a shell, alice loses her rule: the list cache used strcasecmp()" ] },
    { c: "git switch fix/ldif-case-sensitive-users   # strcmp() for users and groups", o: [
      "# sudoers' case_insensitive_user decides matching; hosts still merge" ] },
    { c: "cvtsudoers -i ldif -f sudoers roles.ldif", o: [
      "# sudoRole role1", "+Alice ALL = /usr/bin/id", "# sudoRole role2", "+alice ALL = /bin/sh" ] },
    { c: "make -C plugins/sudoers check", o: [ "+cvtsudoers/test43 ... ok" ] }
  ],

  "OpenPrinting/cups#1782": [
    { c: "ipptool -f /dev/null ipp://localhost/ create-local.test   # device-uri socket://10.0.0.5", o: [
      "!CUPS-Create-Local-Printer: Bad device-uri \"\".",
      "# ptr had been walked to the end of printer-name; master switched to it in 9fa1c04f" ] },
    { c: "git switch fix/create-local-uri-message", o: [] },
    { c: "ipptool -f /dev/null ipp://localhost/ create-local.test", o: [
      "+CUPS-Create-Local-Printer: Bad device-uri \"socket://10.0.0.5\"." ] }
  ],

  "sudo-project/sudo#573": [
    { c: "visudo -c -s -f bad.sudoers   # /bin/ls ^[a-z$  and  /bin/cat ^foo(bar$", o: [
      "!bad.sudoers: parsed OK",
      "# strict mode compiled sudoerstext, which is just the matched $" ] },
    { c: "git switch fix/strict-arg-regex   # compile the collected command args", o: [] },
    { c: "visudo -c -s -f bad.sudoers", o: [
      "+bad.sudoers:1:25: Unmatched [, [^, [:, [., or [=",
      "+bad.sudoers:2:29: Unmatched ( or \\(" ] },
    { c: "make -C plugins/sudoers check", o: [ "+all tests passed   (/bin/ls ^[a-z]+$ still parses)" ] }
  ],

  "sudo-project/sudo#574": [
    { c: "cvtsudoers -i ldif three-folds.ldif   # sudoCommand split over three lines", o: [
      "!cvtsudoers: invalid LDIF attribute: sudoCommandart httpd",
      "# after the append, len held only the continuation's length" ] },
    { c: "git switch fix/ldif-fold-length", o: [] },
    { c: "cvtsudoers -i ldif three-folds.ldif", o: [
      "+millert ALL = /usr/bin/systemctl restart httpd, /usr/bin/ls" ] },
    { c: "make -C plugins/sudoers check", o: [ "+cvtsudoers/test42 ... ok   (fails without the fix)" ] }
  ],

  "util-linux/util-linux#4692": [
    { c: "unshare -Urm sh -c 'for i in $(seq 2000); do mkdir -p /tmp/m/$i; mount -t tmpfs none /tmp/m/$i; done; time findmnt -U > /dev/null'", o: [
      "!real\t0m51.8s",
      "# every pair compared, each through a linear cache_find_path() scan: O(n^3)" ] },
    { c: "git switch perf/libmount-path-cache-hash", o: [
      "# hash ignores repeated and trailing slashes, so it agrees with streq_paths()" ] },
    { c: "unshare -Urm sh -c '...; time findmnt -U > /dev/null'", o: [
      "+real\t0m0.28s   185x",
      "+500 mounts: 0.055 s (was 2.0 s)   1000: 0.086 s (was 6.6 s)" ] },
    { c: "./compare-findmnt.sh --old master --new HEAD", o: [
      "+229 invocations: stdout, stderr and exit codes byte-identical" ] }
  ],

  "NLnetLabs/unbound#1532": [
    { c: "./harness parse-packet '. RRSIG (empty rdata)' '. A 7200 1.2.3.4'", o: [
      "RRSIG [ttl=3600 rdlen=0]",
      "!A     [ttl=3600 rdlen=0]   (picked up the RRSIG's TTL and rdata)",
      "# the first short-RRSIG return skipped restoring the packet position" ] },
    { c: "git switch fix/rrsig-covered-position", o: [] },
    { c: "./harness parse-packet '. RRSIG (empty rdata)' '. A 7200 1.2.3.4'", o: [
      "RRSIG [ttl=3600 rdlen=0]", "+A     [ttl=7200 rdlen=4]" ] },
    { c: "make unittest && ./unittest", o: [ "+All tests passed" ] }
  ],

  "NLnetLabs/unbound#1528": [
    { c: "./harness nsec-at-apex --bitmap 3,4,3-nosoa,9", o: [
      "!3-byte bitmap, SOA            no",
      "!4-byte bitmap, SOA            no",
      "3-byte bitmap, no SOA         no",
      "9-byte bitmap, SOA (signed)   yes",
      "# the rdata end was pos+4+rdatalen; reading starts at the TTL, so pos+6" ] },
    { c: "git switch fix/nsec-apex-bounds", o: [] },
    { c: "./harness nsec-at-apex --bitmap 3,4,3-nosoa,9", o: [
      "+3-byte bitmap, SOA            yes", "+4-byte bitmap, SOA            yes",
      "3-byte bitmap, no SOA         no", "9-byte bitmap, SOA (signed)   yes" ] }
  ],

  "avahi/avahi#998": [
    { c: "./harness add-dns-servers --domain 'my-office-network-segment\\.b.example' 192.168.1.1 fe80::1", o: [
      "avahi_key_new() failed.",
      "!Segmentation fault (exit 139)",
      "# char n[64] cut the name right after a \\ escape; r was used before its NULL check" ] },
    { c: "git switch fix/record-alloc-check", o: [] },
    { c: "./harness add-dns-servers --domain 'my-office-network-segment\\.b.example' 192.168.1.1 fe80::1", o: [
      "+192.168.1.1: added",
      "+fe80::1: Failed to add DNS server address: Memory exhausted" ] },
    { c: "valgrind ./avahi-test", o: [ "+runs through cleanly   (both new cases segfault without the fix)" ] }
  ],

  "OpenPrinting/cups#1769": [
    { c: "./harness validate-uri --lengths 100,1023,1024,2000", o: [
      "100   -> 1", "1023  -> 1", "!1024  -> 1", "!2000  -> 1",
      "# set the bad-length error, then fell through and reported valid" ] },
    { c: "git switch fix/ipp-validate-uri-length   # the missing return (0)", o: [] },
    { c: "./harness validate-uri --lengths 100,1023,1024,2000", o: [
      "100   -> 1", "1023  -> 1", "+1024  -> 0", "+2000  -> 0" ] },
    { c: "make test -C cups testipp", o: [ "+testipp passes" ] }
  ],

  "OpenPrinting/cups#1770": [
    { c: "./harness passenv 'A B' 'A, B' 'A  B' 'A , B'", o: [
      "[A] [B]", "![A] [] [B]", "![A] [] [B]", "![A] [] [] [B]",
      "# !isspace(c) || c != ',' is always true, so separators were never skipped" ] },
    { c: "git switch fix/passenv-separators   # || -> &&", o: [] },
    { c: "./harness passenv 'A B' 'A, B' 'A  B' 'A , B'", o: [
      "+[A] [B]", "+[A] [B]", "+[A] [B]", "+[A] [B]" ] }
  ],

  "avahi/avahi#997": [
    { c: "rg -n 'size = 0' avahi-daemon/dbus-util.c", o: [
      "!size = 0;   # zeroes the local pointer; the caller's size is left as it was",
      "# *rdata is reset to NULL on the same path, so the out-parameters disagree" ] },
    { c: "git switch fix/dbus-read-rdata-size   # *size = 0", o: [
      "# the only caller gives up on error today; this protects the next one" ] },
    { c: "meson compile -C build", o: [ "+builds with D-Bus enabled, no new warnings" ] }
  ]
});
