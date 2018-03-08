package test.test;

@Deprecated
public static class X <T> {
   public final class Test {}
   public interface T1<T> {}
   public class T2 {
      T1 t = new T1<Test>() {};
   }
   void a1 () {}
   public void a2() {}
   static void a3() {}
   @Override @Test.Test(a=1) public void a4() {
      (x -> System.out.println(x))(1);
      ((x) -> System.out.println(x+1))(2);
      a = x[0].b1();
   }

   public @interface a5 {}
   public interface a6 {
      int a(int x);
   }
   <T> void a7() {}
   public static <T> java.lang.String a8() { return ""; }

   public void ArrayList<string> a8_1() {}

   @SuppressWarnings("xxx")
   @interface a9{}
}
