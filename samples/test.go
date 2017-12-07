package main

import "fmt"

type B struct{}
type C struct{}
type D struct {
   B; C
   aa interface{}
}
type E[][] **[]interface{}
type (F []int; G [][][]* interface{})

func (b *B) a() {
   fmt.Println("xxxxxx")
}

func (b *B) b() func(int) int {
   return func (x int) int {
      return 0;
   }
}

func (b *B) test(x func() int) func(func() int) int {
   return func (x func() int) int {
      (func(x int) {
         fmt.Println("pppp");
      })(1)
      return 0;
   }
}

func main() {
   var b interface {
      a()
   }
   a := new(struct {
      x int
   })
   a.x = 1
   b = new(B)
   b.a()
   if a.x == 1 {
      a.x = (
         2)
   }
   c := make(F, 3)
   c[0] = 1
   fmt.Println("hello world")
}
