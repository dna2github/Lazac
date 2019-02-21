package test.test;

import java.util.ArrayList;

@Deprecated
public class X <T> {
   public interface T1<T> {}
   public class T2 {
      T1 t = new T1<Test>() {};
   }
   public static class T3 extends X<String> {
      int b1() { return 0; }
   }
   void a1 () {}
   public void a2() {}
   static void a3() {}
   public final static class Test {
      public static @interface TestX {
         int a = 0;
      }
   }

   public static interface F {
      void run(int x);
      default void f(int x) {
         System.out.println(x + 1);
      }
   }
   @a5 @X.Test.TestX() public void a4() {
      F fn1 = x -> System.out.println(x);
      F fn2 = (int x) -> System.out.println(x+1);
      fn2.run(1);
      int a = 0;
      T3 x[] = new T3[10];
      a += x[0].b1();
      a *= 1 << 2 + 3;
      a >>>= a++ + 1;
   }

   public @interface a5 {}
   public interface a6 {
      int a(int x);
   }
   <T> void a7() {}
   public static <T extends ArrayList<String> > java.lang.String a8() { return ""; }

   public ArrayList<String>[][][] a8_1() { return null; }

   @SuppressWarnings("xxx")
   @interface a9{}

   public static void main(String[] args) {}
}
