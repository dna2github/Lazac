a = ""
b = 1
puts a.
class

puts a + if b == 1 then "x" else "y" end
=begin
hello world end =begin =end
=end

def a(x)
   puts x
   # this is comment ? =begin =end
end

=begin again
=end

def b
   puts "wojofiewf"
   y = 1
   z = if y == 1 then y+1 else y+2 end
   z = z + ( if y == 1 then 3 else 9 end ) + 2 \
      if y == 1
end

puts %-a-
puts %q["mane"]
puts %Q["mane"]
puts %["mane"]
puts %q{"mane"}
puts %q("(m(a(n)e)")?)
# puts %i(#{ "interpolated" } int)/i
puts %q-mane-
puts %q\mane\

puts <<EOF
echo 1 #{$x}
EOF

puts <<-EOS
jeeepwofjeowpf
ab  sdfwefwef
       EOS
puts "b"

a_b_c_d = 1
puts b, a_b_c_d

puts %{
   hello
}
